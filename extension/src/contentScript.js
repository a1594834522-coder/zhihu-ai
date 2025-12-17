const SELECTORS = {
  // Some answers are lazily rendered / folded and may not have schema attributes immediately.
  answerRoot: '.ContentItem.AnswerItem',
  actions: '.ContentItem-actions, .RichContent-actions',
  richContent: '.RichContent',
  text: '[itemprop="text"]'
};

const DATA = {
  btn: 'zhihuAiSummaryBtn',
  box: 'zhihuAiSummaryBox'
};

function getAnswerId(answerEl) {
  const byName = answerEl.getAttribute('name');
  if (byName) return byName;
  const zop = answerEl.getAttribute('data-zop');
  if (!zop) return null;
  try {
    const parsed = JSON.parse(zop.replaceAll('&quot;', '"'));
    return parsed?.itemId ?? null;
  } catch {
    return null;
  }
}

function getAnswerText(answerEl) {
  const textEl = answerEl.querySelector(SELECTORS.text);
  if (!textEl) return '';
  const raw = textEl.innerText || textEl.textContent || '';
  return normalizeForAi(raw);
}

function createButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className =
    'Button ContentItem-action Button--plain Button--withIcon Button--withLabel zhihu-ai-summary-btn';
  btn.textContent = 'AI总结';
  btn.dataset[DATA.btn] = '1';
  return btn;
}

function createBox({ summary, providerLabel }) {
  const box = document.createElement('div');
  box.className = 'zhihu-ai-summary-box';
  box.dataset[DATA.box] = '1';

  const head = document.createElement('div');
  head.className = 'zhihu-ai-summary-box__head';

  const title = document.createElement('div');
  title.className = 'zhihu-ai-summary-box__title';
  title.textContent = 'AI 总结';

  const meta = document.createElement('div');
  meta.className = 'zhihu-ai-summary-box__meta';
  meta.textContent = providerLabel ? `via ${providerLabel}` : '';

  head.append(title, meta);

  const body = document.createElement('div');
  body.className = 'zhihu-ai-summary-box__body';
  body.textContent = summary;

  box.append(head, body);
  return box;
}

function normalizeForAi(text) {
  return String(text || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mountOnAnswer(answerEl) {
  const actionsEl = answerEl.querySelector(SELECTORS.actions);
  if (!actionsEl) return;

  // Some answers are re-rendered in place (e.g. expand/collapse) and may lose injected nodes.
  // Only skip if the button still exists.
  const existingBtn = actionsEl.querySelector(`[data-${toKebab(DATA.btn)}="1"]`);
  if (existingBtn) return;

  const btn = createButton();
  btn.addEventListener('click', async () => {
    const existingBox = answerEl.querySelector(`[data-${toKebab(DATA.box)}="1"]`);
    if (existingBox) {
      existingBox.remove();
      return;
    }

    const answerId = getAnswerId(answerEl);
    const text = getAnswerText(answerEl);
    if (!text) {
      alert('未能提取回答正文文本（可能未展开/未加载完成）。');
      return;
    }

    const originalText = btn.textContent;
    btn.textContent = '总结中...';
    btn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ZHIHU_AI_SUMMARIZE',
        answerId,
        url: location.href,
        text
      });
      if (!response || !response.ok) {
        throw new Error(response?.error || 'Unknown error');
      }
      const summary = String(response.summary || '').trim();
      if (!summary) throw new Error('Empty summary');

      const box = createBox({ summary, providerLabel: response.providerLabel });
      const richContent = answerEl.querySelector(SELECTORS.richContent);
      if (richContent?.parentElement) {
        richContent.parentElement.insertBefore(box, richContent.nextSibling);
      } else {
        answerEl.appendChild(box);
      }
    } catch (e) {
      alert(`AI 总结失败：${e?.message || String(e)}`);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });

  actionsEl.appendChild(btn);
}

function toKebab(camel) {
  return camel.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function scanAndMount() {
  const answers = document.querySelectorAll(SELECTORS.answerRoot);
  for (const answerEl of answers) mountOnAnswer(answerEl);
}

function startObserver() {
  const observer = new MutationObserver(() => {
    scheduleScan();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-expanded']
  });
}

let scanScheduled = false;
function scheduleScan() {
  if (scanScheduled) return;
  scanScheduled = true;
  // Use rAF so we run after DOM updates from expand/collapse interactions.
  requestAnimationFrame(() => {
    scanScheduled = false;
    scanAndMount();
  });
}

scanAndMount();
startObserver();

// Extra safety for "展开" interactions that only toggle attributes / re-render in place.
document.addEventListener(
  'click',
  (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    if (target.closest('[aria-expanded], [data-zop-retract-question], .RichContent-collapsedText')) {
      setTimeout(scheduleScan, 50);
      setTimeout(scheduleScan, 400);
    }
  },
  true
);
