// Camera — front/back toggle, PiP preview, frame capture
let cameraStream = null;
let facingMode = 'user';
let snapPending = false;

window.toggleCamera = async function () {
  if (cameraStream) {
    stopCamera();
  } else {
    await startCamera();
  }
};

window.flipCamera = async function () {
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  if (cameraStream) {
    stopCamera();
    await startCamera();
  }
};

async function startCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    const video = document.getElementById('cameraPreview');
    video.srcObject = cameraStream;
    await video.play();
    document.getElementById('cameraPip').style.display = 'block';
    document.getElementById('cameraBtn').textContent = '📷✕';
    document.getElementById('cameraFlipBtn').style.display = 'inline-block';
    document.getElementById('snapBtn').style.display = 'inline-block';
  } catch (e) {
    document.getElementById('status').innerText = '相机错误: ' + e.message;
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  const video = document.getElementById('cameraPreview');
  video.srcObject = null;
  document.getElementById('cameraPip').style.display = 'none';
  document.getElementById('cameraBtn').textContent = '📷';
  document.getElementById('cameraFlipBtn').style.display = 'none';
  document.getElementById('snapBtn').style.display = 'none';
  snapPending = false;
  document.getElementById('snapBtn').classList.remove('snapped');
}

// Grab a jpeg data-url from current camera frame
window.captureFrame = function () {
  const video = document.getElementById('cameraPreview');
  if (!video.videoWidth) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
};

window.toggleSnap = function () {
  snapPending = !snapPending;
  document.getElementById('snapBtn').classList.toggle('snapped', snapPending);
};

window.getSnapPending = () => snapPending;
window.clearSnap = () => {
  snapPending = false;
  document.getElementById('snapBtn').classList.remove('snapped');
};
window.isCameraOn = () => !!cameraStream;
