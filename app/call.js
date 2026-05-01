// Video call mode — continuous STT + camera, hands-free conversation
let callActive = false;
let recognition = null;
let pendingText = '';
let sttRestartTimer = null;
let sendTimer = null;

window.toggleCall = async function () {
  if (callActive) stopCall();
  else            await startCall();
};

async function startCall() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    appendBubble('system', '此浏览器不支持语音识别，请用 Chrome/Edge/Safari');
    return;
  }
  // Auto-enable camera so Vega can see user
  if (!window.isCameraOn()) await window.toggleCamera();

  recognition = new SR();
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let interim = '', final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) final += r[0].transcript;
      else           interim += r[0].transcript;
    }
    if (final) pendingText += final;
    document.getElementById('chatInput').value = (pendingText + interim).trim();

    clearTimeout(sendTimer);
    if (pendingText.trim()) {
      // 1.0 second of silence after a finalized phrase = auto-send
      sendTimer = setTimeout(flushPending, 1000);
    }
  };

  recognition.onerror = (e) => {
    if (e.error === 'not-allowed') {
      appendBubble('system', '麦克风权限被拒绝，无法通话');
      stopCall();
    }
  };

  recognition.onend = () => {
    // Browser auto-stops occasionally — restart while in call
    if (callActive) {
      clearTimeout(sttRestartTimer);
      sttRestartTimer = setTimeout(() => { try { recognition.start(); } catch {} }, 250);
    }
  };

  try { recognition.start(); } catch {}
  callActive = true;
  updateCallUI(true);
  setStatus('🎤 通话中…');
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
    // LLM busy — re-queue for after current turn
    pendingText = text;
    return;
  }
  // Attach current camera frame to the message
  if (window.isCameraOn() && !window.getSnapPending()) window.toggleSnap();
  document.getElementById('chatInput').value = text;
  pauseSTT();   // pause while sending + LLM thinks + TTS plays
  window.sendMessage();
}

function pauseSTT() {
  if (!recognition) return;
  try { recognition.onend = null; recognition.stop(); } catch {}
}

function resumeSTT() {
  if (!callActive) return;
  // Recreate handler & restart
  if (!recognition) return;
  recognition.onend = () => {
    if (callActive) {
      clearTimeout(sttRestartTimer);
      sttRestartTimer = setTimeout(() => { try { recognition.start(); } catch {} }, 250);
    }
  };
  try { recognition.start(); } catch {}
}

// Exposed so chat.js can call after TTS ends or LLM done (no TTS)
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
