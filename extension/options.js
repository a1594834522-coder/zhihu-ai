const DEFAULTS = {
  provider: 'openai',
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com',
  openaiModel: 'gpt-4o-mini'
};

function el(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node;
}

async function load() {
  const stored = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  const settings = { ...DEFAULTS, ...stored };
  el('openaiApiKey').value = settings.openaiApiKey || '';
  el('openaiBaseUrl').value = settings.openaiBaseUrl || DEFAULTS.openaiBaseUrl;
  el('openaiModel').value = settings.openaiModel || DEFAULTS.openaiModel;
}

async function save() {
  const openaiApiKey = el('openaiApiKey').value.trim();
  const openaiBaseUrl = el('openaiBaseUrl').value.trim() || DEFAULTS.openaiBaseUrl;
  const openaiModel = el('openaiModel').value.trim() || DEFAULTS.openaiModel;
  await chrome.storage.sync.set({
    provider: 'openai',
    openaiApiKey,
    openaiBaseUrl,
    openaiModel
  });
  el('status').textContent = '已保存';
  setTimeout(() => (el('status').textContent = ''), 1200);
}

el('save').addEventListener('click', () => {
  save().catch((e) => {
    el('status').textContent = `保存失败：${e?.message || String(e)}`;
  });
});

load().catch((e) => {
  el('status').textContent = `加载失败：${e?.message || String(e)}`;
});
