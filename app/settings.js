// Settings panel — persists to localStorage as 'vega.settings'
const DEFAULTS = {
  chat: {
    provider: 'openai', baseUrl: '', model: 'gpt-4o-mini',
    apiKey: '', system: 'You are Vega, a friendly and expressive anime girl. Keep responses concise.', temperature: 0.8,
  },
  tts: {
    enabled: false, provider: 'openai', baseUrl: '', model: 'tts-1',
    voice: 'nova', apiKey: '', extra: { groupId: '', speed: '1', vol: '1', pitch: '0' },
  },
};

const LLM_PROVIDERS = [
  { v: 'openai',     l: 'OpenAI',           base: 'https://api.openai.com/v1',                         model: 'gpt-4o-mini' },
  { v: 'anthropic',  l: 'Anthropic Claude',  base: '',                                                  model: 'claude-haiku-4-5' },
  { v: 'gemini',     l: 'Google Gemini',     base: '',                                                  model: 'gemini-2.0-flash' },
  { v: 'deepseek',   l: 'DeepSeek',          base: 'https://api.deepseek.com/v1',                       model: 'deepseek-chat' },
  { v: 'moonshot',   l: 'Moonshot Kimi',     base: 'https://api.moonshot.cn/v1',                        model: 'moonshot-v1-8k' },
  { v: 'qwen',       l: '通义 Qwen',         base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
  { v: 'doubao',     l: '字节豆包',           base: 'https://ark.cn-beijing.volces.com/api/v3',          model: 'doubao-1-5-lite-32k' },
  { v: 'zhipu',      l: '智谱 GLM',          base: 'https://open.bigmodel.cn/api/paas/v4',              model: 'glm-4-flash' },
  { v: 'minimax',    l: 'MiniMax',           base: 'https://api.minimaxi.chat/v1',                      model: 'MiniMax-Text-01' },
  { v: 'openrouter', l: 'OpenRouter',        base: 'https://openrouter.ai/api/v1',                      model: 'openai/gpt-4o-mini' },
  { v: 'custom',     l: 'Custom (OpenAI compat)', base: '',                                             model: '' },
];

const TTS_PROVIDERS = [
  { v: 'openai',      l: 'OpenAI TTS',   voices: 'alloy,echo,fable,onyx,nova,shimmer' },
  { v: 'elevenlabs',  l: 'ElevenLabs',   voices: '(paste voice ID)' },
  { v: 'minimax',     l: 'MiniMax TTS',  voices: 'female-shaonv,female-yujie,male-qn-qingse,presenter_male' },
];

function loadSettings() {
  try { return JSON.parse(localStorage.getItem('vega.settings')) || DEFAULTS; } catch { return DEFAULTS; }
}

function saveSettings(s) {
  localStorage.setItem('vega.settings', JSON.stringify(s));
}

function buildSettingsPanel() {
  const panel = document.getElementById('settingsPanel');
  const s = loadSettings();

  const llmOpts = LLM_PROVIDERS.map(p =>
    `<option value="${p.v}" ${s.chat.provider === p.v ? 'selected' : ''}>${p.l}</option>`).join('');
  const ttsOpts = TTS_PROVIDERS.map(p =>
    `<option value="${p.v}" ${s.tts.provider === p.v ? 'selected' : ''}>${p.l}</option>`).join('');

  panel.innerHTML = `
    <div class="sp-header"><span>⚙️ 设置</span><button onclick="closeSettings()">✕</button></div>
    <div class="sp-body">
      <div class="sp-section">💬 语言模型</div>
      <label>供应商</label>
      <select id="sp-llm-provider">${llmOpts}</select>
      <label>Base URL <small>（留空用默认）</small></label>
      <input id="sp-llm-base" type="url" placeholder="https://api.openai.com/v1" value="${s.chat.baseUrl}">
      <label>Model</label>
      <input id="sp-llm-model" placeholder="gpt-4o-mini" value="${s.chat.model}">
      <label>API Key</label>
      <input id="sp-llm-key" type="password" placeholder="sk-..." value="${s.chat.apiKey}">
      <label>System Prompt</label>
      <textarea id="sp-llm-system" rows="3">${s.chat.system}</textarea>
      <label>Temperature: <span id="sp-temp-val">${s.chat.temperature}</span></label>
      <input id="sp-llm-temp" type="range" min="0" max="2" step="0.1" value="${s.chat.temperature}"
        oninput="document.getElementById('sp-temp-val').textContent=this.value">

      <div class="sp-section" style="margin-top:16px">🔊 语音合成 (TTS)</div>
      <label style="font-size:14px;color:${s.tts.enabled ? '#4f4' : '#f84'};font-weight:bold">
        <input id="sp-tts-enabled" type="checkbox" ${s.tts.enabled ? 'checked' : ''}>
        启用 TTS ${s.tts.enabled ? '✓ 已开启' : '← 必须勾选才能说话'}
      </label>
      <label>供应商</label>
      <select id="sp-tts-provider">${ttsOpts}</select>
      <label>Base URL <small>（MiniMax: 国内留空，海外填 https://api.minimaxi.chat）</small></label>
      <input id="sp-tts-base" type="url" placeholder="https://api.minimax.chat" value="${s.tts.baseUrl || ''}">
      <label>Voice / Voice ID</label>
      <input id="sp-tts-voice" placeholder="nova" value="${s.tts.voice}">
      <label>Model</label>
      <input id="sp-tts-model" placeholder="tts-1" value="${s.tts.model}">
      <label>API Key</label>
      <input id="sp-tts-key" type="password" placeholder="sk-..." value="${s.tts.apiKey}">
      <label>MiniMax GroupId <small>（仅 MiniMax 需要）</small></label>
      <input id="sp-tts-groupid" placeholder="1234567890" value="${s.tts.extra?.groupId || ''}">

      <button class="sp-save-btn" onclick="saveSettingsFromPanel()">💾 保存</button>
    </div>`;

  document.getElementById('sp-llm-provider').addEventListener('change', function () {
    const p = LLM_PROVIDERS.find(x => x.v === this.value);
    if (p) {
      if (p.base) document.getElementById('sp-llm-base').value = p.base;
      if (p.model) document.getElementById('sp-llm-model').value = p.model;
    }
    saveSettingsFromPanel(true);
  });

  // Auto-save on any field change so data isn't lost if user closes without clicking 保存
  const autoSaveIds = [
    'sp-llm-base','sp-llm-model','sp-llm-key','sp-llm-system','sp-llm-temp',
    'sp-tts-enabled','sp-tts-provider','sp-tts-base','sp-tts-voice','sp-tts-model','sp-tts-key','sp-tts-groupid',
  ];
  autoSaveIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => saveSettingsFromPanel(true));
      el.addEventListener('input',  () => saveSettingsFromPanel(true));
    }
  });
}

window.openSettings = function () {
  buildSettingsPanel();
  document.getElementById('settingsPanel').classList.add('open');
};
window.closeSettings = function () {
  // Save on close too, in case user typed and clicked X without 保存
  try { saveSettingsFromPanel(true); } catch {}
  document.getElementById('settingsPanel').classList.remove('open');
};
window.saveSettingsFromPanel = function (silent) {
  const s = loadSettings();
  s.chat.provider    = document.getElementById('sp-llm-provider').value;
  s.chat.baseUrl     = document.getElementById('sp-llm-base').value.trim();
  s.chat.model       = document.getElementById('sp-llm-model').value.trim();
  s.chat.apiKey      = document.getElementById('sp-llm-key').value.trim();
  s.chat.system      = document.getElementById('sp-llm-system').value;
  s.chat.temperature = parseFloat(document.getElementById('sp-llm-temp').value);
  s.tts.enabled      = document.getElementById('sp-tts-enabled').checked;
  s.tts.provider     = document.getElementById('sp-tts-provider').value;
  s.tts.baseUrl      = document.getElementById('sp-tts-base').value.trim();
  s.tts.voice        = document.getElementById('sp-tts-voice').value.trim();
  s.tts.model        = document.getElementById('sp-tts-model').value.trim();
  s.tts.apiKey       = document.getElementById('sp-tts-key').value.trim();
  s.tts.extra        = { ...s.tts.extra, groupId: document.getElementById('sp-tts-groupid').value.trim() };
  saveSettings(s);
  if (silent) return;
  closeSettings();
  document.getElementById('status').innerText = '设置已保存 ✓';
  setTimeout(() => { document.getElementById('status').innerText = 'Vega Online ✨'; }, 2000);
};
window.getSettings = loadSettings;
