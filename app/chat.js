// Chat logic — send message, receive reply, play TTS, drive lipsync
let chatHistory = [];   // { role, content }
let ttsAudioCtx = null;
let ttsAnalyser = null;
let ttsDataArray = null;

// These are read/set by live2d.js ticker
window.isAudioPlaying = false;
window.interactionState = 'idle';  // 'idle' | 'thinking' | 'glancing' | 'speaking'
window.glanceRight = false;        // true when camera involved → glance right

window.sendMessage = async function () {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  const s = getSettings();
  if (!s.chat.apiKey) {
    appendBubble('system', '请先在 ⚙️ 设置里填写 API Key');
    return;
  }

  const image = getSnapPending() ? captureFrame() : null;
  clearSnap();
  input.value = '';
  input.style.height = 'auto';

  appendBubble('user', text, image);
  chatHistory.push({ role: 'user', content: text });

  setInteractionState('thinking', !!image);
  document.getElementById('sendBtn').disabled = true;

  const emoInstr = '\n\nIMPORTANT: Begin every reply with exactly one emotion tag in square brackets, then your reply. Tags: [EMO:star] for excited / surprised / impressed / proud, [EMO:blush] for shy / flattered / loving / embarrassed-good, [EMO:dark] for annoyed / disappointed / sulky / frustrated, [EMO:none] for neutral. Example: "[EMO:star] Wow, that\'s amazing!" — never explain or mention the tag.';
  const messages = [
    { role: 'system', content: (s.chat.system || '') + emoInstr },
    ...chatHistory,
  ];

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider:    s.chat.provider,
        baseUrl:     s.chat.baseUrl || undefined,
        model:       s.chat.model || undefined,
        apiKey:      s.chat.apiKey,
        temperature: s.chat.temperature,
        messages,
        image:       image || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || res.statusText);

    const raw = data.text;
    const { emo, clean } = parseEmotion(raw);
    applyEmotion(emo);
    chatHistory.push({ role: 'assistant', content: raw });   // keep tag in history so model stays consistent
    appendBubble('assistant', clean);

    if (s.tts.enabled && s.tts.apiKey) {
      if (image) setInteractionState('glancing', true);
      setTimeout(() => speakTTS(clean, s.tts), image ? 1200 : 0);
    } else {
      if (!window._ttsHintShown) {
        window._ttsHintShown = true;
        appendBubble('system', '💡 在 ⚙️ 设置里勾选"启用 TTS"并填入 API Key，Vega 就能开口说话了');
      }
      setInteractionState('idle', false);
    }
  } catch (e) {
    appendBubble('system', '错误：' + e.message);
    setInteractionState('idle', false);
  } finally {
    document.getElementById('sendBtn').disabled = false;
  }
};

async function speakTTS(text, cfg) {
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: cfg.provider,
        baseUrl:  cfg.baseUrl || undefined,
        voice:    cfg.voice || undefined,
        model:    cfg.model || undefined,
        apiKey:   cfg.apiKey,
        text,
        extra:    cfg.extra || {},
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    const audioData = await res.arrayBuffer();
    await playAudioBuffer(audioData);
  } catch (e) {
    appendBubble('system', 'TTS 错误：' + e.message);
    setInteractionState('idle', false);
  }
}

async function playAudioBuffer(arrayBuffer) {
  if (!ttsAudioCtx) {
    ttsAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    ttsAnalyser = ttsAudioCtx.createAnalyser();
    ttsAnalyser.fftSize = 256;
    ttsAnalyser.smoothingTimeConstant = 0.25;  // default 0.8 is way too smooth — kills syllable tracking
    ttsDataArray = new Uint8Array(ttsAnalyser.frequencyBinCount);
    ttsAnalyser.connect(ttsAudioCtx.destination);
    // Expose to live2d.js ticker
    window.ttsAnalyser = ttsAnalyser;
    window.ttsDataArray = ttsDataArray;
  }
  if (ttsAudioCtx.state === 'suspended') await ttsAudioCtx.resume();

  const decoded = await ttsAudioCtx.decodeAudioData(arrayBuffer);
  const source = ttsAudioCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(ttsAnalyser);

  setInteractionState('speaking', false);
  window.isAudioPlaying = true;

  source.onended = () => {
    window.isAudioPlaying = false;
    setInteractionState('idle', false);
  };
  source.start(0);
}

function setInteractionState(state, cameraRelated) {
  window.interactionState = state;
  window.glanceRight = !!cameraRelated;
}

// Strip [EMO:xxx] tag from start (or anywhere) of response, return both pieces.
function parseEmotion(text) {
  const re = /\[EMO:(star|blush|dark|none)\]/i;
  const m  = text.match(re);
  const emo = m ? m[1].toLowerCase() : null;
  const clean = text.replace(re, '').trim();
  return { emo, clean };
}

function applyEmotion(emo) {
  const map = { star: 'expression3', blush: 'expression2', dark: 'expression1', none: null };
  if (emo == null) return;        // no tag — leave previous expression
  window.setExpr ? window.setExpr(map[emo]) : null;
  if (map[emo] === null) window.clearExpr && window.clearExpr();
}

function appendBubble(role, text, image) {
  const history = document.getElementById('chatHistory');
  history.style.display = 'flex';
  const div = document.createElement('div');
  div.className = `bubble bubble-${role}`;
  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.style.cssText = 'max-width:120px;max-height:90px;border-radius:6px;display:block;margin-bottom:4px';
    div.appendChild(img);
  }
  const span = document.createElement('span');
  span.textContent = text;
  div.appendChild(span);
  history.appendChild(div);
  history.scrollTop = history.scrollHeight;
}

window.clearChat = function () {
  chatHistory = [];
  const h = document.getElementById('chatHistory');
  h.innerHTML = '';
  h.style.display = 'none';
};

// Body-part tap: inject a roleplay action and let Vega respond naturally
let _lastTapAt = 0;
window.onBodyTap = function (zone) {
  const now = performance.now();
  if (now - _lastTapAt < 3000) return;          // 3-second cooldown
  if (document.getElementById('sendBtn').disabled) return;  // already busy
  _lastTapAt = now;

  const actionMap = {
    '头发': '*摸了摸你的头发*',
    '脸':   '*轻轻碰了碰你的脸*',
    '左耳': '*碰了碰你的耳朵*',
    '右耳': '*碰了碰你的耳朵*',
    '脖子': '*戳了戳你的脖子*',
    '胸口': '*点了点你的胸口*',
    '左手': '*握了握你的手*',
    '右手': '*握了握你的手*',
    '腰':   '*戳了戳你的腰*',
    '腿':   '*拍了拍你的腿*',
  };
  const action = actionMap[zone] || `*碰了碰你的${zone}*`;

  const input = document.getElementById('chatInput');
  if (input.value.trim()) return;   // don't interrupt if user is typing
  input.value = action;
  window.sendMessage();
};

// Allow Enter to send (Shift+Enter for newline)
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('chatInput');
  if (!inp) return;
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.sendMessage(); }
  });
  inp.addEventListener('input', () => {
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
  });
});
