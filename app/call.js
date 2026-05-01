// Video call mode — continuous STT + camera, hands-free conversation
let callActive = false;
let recognition = null;
let pendingText = '';
let sttRestartTimer = null;
let sendTimer = null;
let lastErrorAt = 0;

window.toggleCall = async function () {
  if (callActive) stopCall();
  else            await startCall();
};

async function startCall() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    appendBubble('system', '⚠️ 此浏览器不支持语音识别。\niOS Safari 不支持，请用 Android Chrome 或桌面 Chrome。');
    return;
  }

  // Explicitly request mic so any permission/hardware errors surface NOW
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach(t => t.stop());
  } catch (e) {
    appendBubble('system', '🎤 麦克风访问失败: ' + e.message);
    return;
  }

  // Auto-enable camera so Vega can see user
  if (!window.isCameraOn()) {
    try { await window.toggleCamera(); } catch (e) {}
  }

  recognition = new SR();
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart  = () => setStatus('🎤 通话中… (说话试试)');
  recognition.onaudiostart  = () => setStatus('🎤 听到声音了…');
  recognition.onspeechstart = () => setStatus('🎤 正在识别…');

  recognition.onresult = (event) => {
    let interim = '', final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) final += r[0].transcript;
      else           interim += r[0].transcript;
    }
    if (final)   pendingText += final;
    document.getElementById('chatInput').value = (pendingText + interim).trim();
    if (interim || final) setStatus('🎤 识别中: ' + (pendingText + interim).trim().slice(-20));

    clearTimeout(sendTimer);
    if (pendingText.trim()) sendTimer = setTimeout(flushPending, 1000);
  };

  recognition.onerror = (e) => {
    const now = Date.now();
    // Throttle error bubbles so we don't spam
    if (e.error !== 'no-speech' && now - lastErrorAt > 3000) {
      lastErrorAt = now;
      appendBubble('system', '🎤 识别错误: ' + e.error);
    }
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      stopCall();
    }
  };

  recognition.onend = () => {
    if (!callActive) return;
    clearTimeout(sttRestartTimer);
    sttRestartTimer = setTimeout(() => {
      try { recognition.start(); } catch (e) { /* already started */ }
    }, 400);
  };

  try {
    recognition.start();
    callActive = true;
    updateCallUI(true);
    setStatus('🎤 通话中… (说话试试)');
  } catch (e) {
    appendBubble('system', '🎤 启动失败: ' + e.message);
  }
}

function stopCall() {
  callActive = false;
  clearTimeout(sendTimer);
  clearTimeout(sttRestartTimer);
  if (recognition) {
    recognition.onend = null;
    try { recognition.stop(); } catch {}
    recognition = null;
  }
  pendingText = '';
  updateCallUI(false);
  setStatus('Vega Online ✨');
}

function flushPending() {
  const text = pendingText.trim();
  pendingText = '';
  if (!text || text.length < 2) return;
  if (document.getElementById('sendBtn').disabled) {
    pendingText = text;
    return;
  }
  if (window.isCameraOn() && !window.getSnapPending()) window.toggleSnap();
  document.getElementById('chatInput').value = text;
  pauseSTT();
  window.sendMessage();
}

function pauseSTT() {
  if (!recognition) return;
  try { recognition.onend = null; recognition.stop(); } catch {}
}

function resumeSTT() {
  if (!callActive) return;
  // Recreate the auto-restart handler & try to start again
  if (recognition) {
    recognition.onend = () => {
      if (!callActive) return;
      clearTimeout(sttRestartTimer);
      sttRestartTimer = setTimeout(() => { try { recognition.start(); } catch {} }, 400);
    };
    try { recognition.start(); setStatus('🎤 通话中… (你说)'); } catch {}
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
