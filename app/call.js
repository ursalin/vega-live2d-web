// Video call mode — supports browser SpeechRecognition + server-side Whisper (Groq/OpenAI)
let callActive = false;
let recognition = null;       // browser STT
let mediaRecorder = null;     // server STT recorder
let micStream = null;
let audioCtx = null;
let analyser = null;
let recorderChunks = [];
let isRecording = false;
let speechStart = 0;
let silenceStart = 0;
let vadRafId = 0;
let pendingText = '';
let sendTimer = null;
let sttRestartTimer = null;
let lastErrorAt = 0;

const SILENCE_THRESHOLD = 0.022;
const SPEECH_DURATION   = 200;
const SILENCE_DURATION  = 1100;
const MAX_UTTERANCE_MS  = 30000;
let recStartedAt = 0;

window.toggleCall = async function () {
  if (callActive) stopCall();
  else            await startCall();
};

async function startCall() {
  const s = getSettings();
  const sttProvider = s.stt?.provider || 'browser';

  // Mic permission probe (also keeps stream for MediaRecorder)
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    appendBubble('system', '🎤 麦克风访问失败: ' + e.message);
    return;
  }

  if (!window.isCameraOn()) {
    try { await window.toggleCamera(); } catch {}
  }

  callActive = true;
  updateCallUI(true);

  if (sttProvider === 'browser') {
    startBrowserSTT();
  } else {
    if (!s.stt?.apiKey) {
      appendBubble('system', `⚠️ 已选 ${sttProvider} STT 但未填 API Key (在 ⚙️ 设置 → 语音识别)`);
      stopCall();
      return;
    }
    startServerSTT(s.stt);
  }
}

function stopCall() {
  callActive = false;
  clearTimeout(sendTimer);
  clearTimeout(sttRestartTimer);
  cancelAnimationFrame(vadRafId);
  if (recognition) {
    recognition.onend = null;
    try { recognition.stop(); } catch {}
    recognition = null;
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop(); } catch {}
  }
  mediaRecorder = null;
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  if (audioCtx) {
    try { audioCtx.close(); } catch {}
    audioCtx = null;
  }
  pendingText = '';
  isRecording = false;
  recorderChunks = [];
  updateCallUI(false);
  setStatus('Vega Online ✨');
}

// ── Browser SpeechRecognition path ──────────────────────────────────
function startBrowserSTT() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    appendBubble('system', '⚠️ 浏览器不支持 SpeechRecognition。\n请在设置里改用 Groq Whisper');
    stopCall();
    return;
  }
  recognition = new SR();
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart        = () => setStatus('🎤 通话中… (说话试试)');
  recognition.onaudiostart   = () => setStatus('🎤 听到声音了…');
  recognition.onspeechstart  = () => setStatus('🎤 正在识别…');

  recognition.onresult = (event) => {
    let interim = '', final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) final += r[0].transcript;
      else           interim += r[0].transcript;
    }
    if (final) pendingText += final;
    document.getElementById('chatInput').value = (pendingText + interim).trim();
    if (interim || final) setStatus('🎤 ' + (pendingText + interim).trim().slice(-20));

    clearTimeout(sendTimer);
    if (pendingText.trim()) sendTimer = setTimeout(flushPendingText, 1000);
  };
  recognition.onerror = (e) => {
    const now = Date.now();
    if (e.error !== 'no-speech' && now - lastErrorAt > 3000) {
      lastErrorAt = now;
      appendBubble('system', '🎤 识别错误: ' + e.error + '（可在设置里改用 Groq Whisper）');
    }
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') stopCall();
  };
  recognition.onend = () => {
    if (!callActive) return;
    clearTimeout(sttRestartTimer);
    sttRestartTimer = setTimeout(() => { try { recognition.start(); } catch {} }, 400);
  };
  try {
    recognition.start();
    setStatus('🎤 通话中… (说话试试)');
  } catch (e) {
    appendBubble('system', '🎤 启动失败: ' + e.message);
  }
}

// ── Server STT path (Groq / OpenAI Whisper) ─────────────────────────
function startServerSTT(sttCfg) {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const src = audioCtx.createMediaStreamSource(micStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.5;
  src.connect(analyser);

  // Pick a supported mime
  const mimeCandidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  let mime = '';
  for (const m of mimeCandidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) { mime = m; break; }
  }
  try {
    mediaRecorder = mime ? new MediaRecorder(micStream, { mimeType: mime })
                         : new MediaRecorder(micStream);
  } catch (e) {
    appendBubble('system', '🎤 录音器创建失败: ' + e.message);
    stopCall();
    return;
  }
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recorderChunks.push(e.data); };
  mediaRecorder.onstop = async () => {
    const blob = new Blob(recorderChunks, { type: mime || 'audio/webm' });
    recorderChunks = [];
    if (blob.size < 2500) return;   // discard noise blips
    await transcribeAndSend(blob, sttCfg);
  };

  setStatus('🎤 通话中… (说话试试)');
  vadLoop();
}

const vadBuf = new Uint8Array(256);
function vadLoop() {
  if (!callActive || !analyser) return;
  vadRafId = requestAnimationFrame(vadLoop);
  analyser.getByteFrequencyData(vadBuf);
  let sum = 0;
  for (let i = 1; i < 22; i++) sum += vadBuf[i];        // speech band
  const rms = (sum / 21) / 255;

  const now = performance.now();

  // Don't pick up Vega's own voice while she's speaking
  if (window.isAudioPlaying) {
    if (isRecording) { try { mediaRecorder.stop(); } catch {} isRecording = false; }
    speechStart = silenceStart = 0;
    return;
  }

  if (!isRecording) {
    if (rms > SILENCE_THRESHOLD) {
      if (!speechStart) speechStart = now;
      else if (now - speechStart > SPEECH_DURATION) {
        try { mediaRecorder.start(); isRecording = true; recStartedAt = now; setStatus('🔴 正在录音…'); } catch {}
      }
    } else {
      speechStart = 0;
    }
  } else {
    if (rms < SILENCE_THRESHOLD) {
      if (!silenceStart) silenceStart = now;
      else if (now - silenceStart > SILENCE_DURATION) {
        try { mediaRecorder.stop(); } catch {}
        isRecording = false;
        silenceStart = 0;
        setStatus('☁️ 识别中…');
      }
    } else {
      silenceStart = 0;
    }
    // Hard cap on utterance length
    if (now - recStartedAt > MAX_UTTERANCE_MS) {
      try { mediaRecorder.stop(); } catch {}
      isRecording = false;
    }
  }
}

async function transcribeAndSend(blob, sttCfg) {
  const fd = new FormData();
  fd.append('audio', blob, 'audio.webm');
  fd.append('apiKey', sttCfg.apiKey);
  fd.append('provider', sttCfg.provider);
  fd.append('language', 'zh');
  try {
    const r = await fetch('/api/stt', { method: 'POST', body: fd });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || r.statusText);
    const text = (j.text || '').trim();
    if (!text || text.length < 2) {
      setStatus('🎤 通话中… (说话试试)');
      return;
    }
    sendCapturedText(text);
  } catch (e) {
    appendBubble('system', '识别失败: ' + e.message);
    setStatus('🎤 通话中…');
  }
}

function sendCapturedText(text) {
  if (document.getElementById('sendBtn').disabled) {
    pendingText = text;
    setTimeout(flushPendingText, 800);
    return;
  }
  if (window.isCameraOn() && !window.getSnapPending()) window.toggleSnap();
  document.getElementById('chatInput').value = text;
  pauseSTT();
  window.sendMessage();
}

function flushPendingText() {
  const text = pendingText.trim();
  pendingText = '';
  if (!text || text.length < 2) return;
  sendCapturedText(text);
}

// ── pause/resume hooks called by chat.js ──
function pauseSTT() {
  if (recognition) {
    try { recognition.onend = null; recognition.stop(); } catch {}
  }
  // For server STT path: VAD itself pauses while window.isAudioPlaying
}
function resumeSTT() {
  if (!callActive) return;
  if (recognition) {
    recognition.onend = () => {
      if (!callActive) return;
      clearTimeout(sttRestartTimer);
      sttRestartTimer = setTimeout(() => { try { recognition.start(); } catch {} }, 400);
    };
    try { recognition.start(); setStatus('🎤 通话中… (你说)'); } catch {}
  } else {
    setStatus('🎤 通话中… (你说)');
  }
}

window._callPauseSTT  = pauseSTT;
window._callResumeSTT = resumeSTT;
window._callIsActive  = () => callActive;

function updateCallUI(active) {
  const btn = document.getElementById('callBtn');
  if (!btn) return;
  btn.textContent = active ? '📞✕' : '📞';
  btn.classList.toggle('call-active', active);
}
function setStatus(msg) {
  const el = document.getElementById('status');
  if (el) el.innerText = msg;
}
