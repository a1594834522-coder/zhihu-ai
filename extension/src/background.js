const DEFAULTS = {
  provider: 'openai',
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com',
  openaiModel: 'gpt-4o-mini'
};

async function getSettings() {
  const stored = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

function normalizeForAi(text) {
  return String(text || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

function buildResponsesUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/g, '');
  if (!trimmed) return null;
  if (trimmed.endsWith('/v1')) return `${trimmed}/responses`;
  return `${trimmed}/v1/responses`;
}

function buildChatCompletionsUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/g, '');
  if (!trimmed) return null;
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function validateBaseUrl(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('Invalid baseUrl');
  }
  const isLocalhost =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
  if (!isLocalhost && url.protocol !== 'https:') {
    throw new Error('baseUrl must be https (unless localhost)');
  }
}

function extractApiErrorMessage(data, fallback) {
  const msg = data?.error?.message;
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  if (typeof data?.message === 'string' && data.message.trim()) return data.message.trim();
  return fallback;
}

function shouldFallbackToChatCompletions(status, data) {
  if (status === 404 || status === 405 || status === 501) return true;
  if (status === 400) {
    const msg = extractApiErrorMessage(data, '').toLowerCase();
    if (
      msg.includes('unknown endpoint') ||
      msg.includes('unrecognized request url') ||
      msg.includes('not found') ||
      msg.includes('no route') ||
      msg.includes('unsupported')
    ) {
      return true;
    }
  }
  return false;
}

function shouldFallbackToResponses(status, data) {
  if (status === 404 || status === 405 || status === 501) return true;
  if (status === 400) {
    const msg = extractApiErrorMessage(data, '').toLowerCase();
    if (
      msg.includes('unknown endpoint') ||
      msg.includes('unrecognized request url') ||
      msg.includes('not found') ||
      msg.includes('no route') ||
      msg.includes('unsupported')
    ) {
      return true;
    }
  }
  return false;
}

function extractTextFromOpenAIResponse(data) {
  if (!data) return null;
  if (typeof data.output_text === 'string') return data.output_text;
  const output = data.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (item?.type !== 'message') continue;
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      const parts = content
        .map((c) => (typeof c?.text === 'string' ? c.text : c?.type === 'output_text' ? c.text : null))
        .filter(Boolean);
      if (parts.length) return parts.join('\n');
    }
  }
  const chat = data.choices?.[0]?.message?.content;
  if (typeof chat === 'string') return chat;
  return null;
}

function extractTextFromChatCompletionsResponse(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  const text = data?.choices?.[0]?.text;
  if (typeof text === 'string') return text;
  return null;
}

async function postJson({ url, apiKey, body }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

async function summarizeWithOpenAI({ apiKey, baseUrl, model, text }) {
  const system =
    '你是一个中文总结助手。请用简洁要点总结知乎回答内容：\n' +
    '- 3~6 条要点\n' +
    '- 若有观点/建议/结论，单独一条\n' +
    '- 保持客观，不要杜撰\n' +
    '- 不要输出多余前后缀';

  const cleanedText = normalizeForAi(text);
  if (!cleanedText) throw new Error('Empty answer text after normalization');

  validateBaseUrl(baseUrl);

  // Default to /chat/completions for OpenAI-compatible providers; fallback to /responses.
  const chatUrl = buildChatCompletionsUrl(baseUrl);
  if (!chatUrl) throw new Error('Missing baseUrl');

  const chatBody = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: cleanedText }
    ],
    max_tokens: 400,
    temperature: 0.2
  };

  const chatRes = await postJson({ url: chatUrl, apiKey, body: chatBody });
  if (chatRes.ok) {
    const summary = extractTextFromChatCompletionsResponse(chatRes.data);
    if (!summary) throw new Error('Failed to parse /chat/completions response');
    return { summary: summary.trim(), apiFlavor: 'chat_completions' };
  }

  if (!shouldFallbackToResponses(chatRes.status, chatRes.data)) {
    throw new Error(extractApiErrorMessage(chatRes.data, `HTTP ${chatRes.status}`));
  }

  const responsesUrl = buildResponsesUrl(baseUrl);
  if (!responsesUrl) throw new Error('Missing baseUrl');

  const responsesBody = {
    model,
    input: [
      { role: 'system', content: system },
      { role: 'user', content: cleanedText }
    ],
    max_output_tokens: 400
  };

  const responsesRes = await postJson({ url: responsesUrl, apiKey, body: responsesBody });
  if (!responsesRes.ok) {
    throw new Error(extractApiErrorMessage(responsesRes.data, `HTTP ${responsesRes.status}`));
  }
  const summary = extractTextFromOpenAIResponse(responsesRes.data);
  if (!summary) throw new Error('Failed to parse /responses response');
  return { summary: summary.trim(), apiFlavor: 'responses' };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'ZHIHU_AI_SUMMARIZE') return;

  (async () => {
    const { provider, openaiApiKey, openaiBaseUrl, openaiModel } = await getSettings();
    if (provider !== 'openai') {
      throw new Error(`Unsupported provider: ${provider}`);
    }
    if (!openaiApiKey) {
      throw new Error('Missing OpenAI API key. Please set it in extension options.');
    }
    if (!openaiBaseUrl) {
      throw new Error('Missing baseUrl. Please set it in extension options.');
    }

    const text = String(msg.text || '');
    const result = await summarizeWithOpenAI({
      apiKey: openaiApiKey,
      baseUrl: openaiBaseUrl,
      model: openaiModel,
      text
    });

    return {
      ok: true,
      summary: result.summary,
      providerLabel: `${openaiBaseUrl.replace(/\/+$/g, '')}/${openaiModel} (${result.apiFlavor})`
    };
  })()
    .then((payload) => sendResponse(payload))
    .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));

  return true;
});
