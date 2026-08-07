// Delcargo HR Tracker — Offscreen Document for Full Desktop Monitor Capture

let screenStream = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_SCREEN_STREAM') {
    startScreenStream(msg.streamId).then((res) => sendResponse(res));
    return true;
  }
  if (msg.type === 'CAPTURE_DESKTOP_FRAME') {
    captureFrame().then((res) => sendResponse(res));
    return true;
  }
});

async function startScreenStream(streamId) {
  try {
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
    }

    screenStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId
        }
      }
    });

    const video = document.getElementById('screenVideo');
    video.muted = true;
    video.srcObject = screenStream;

    return new Promise((resolve) => {
      video.onloadedmetadata = async () => {
        try {
          await video.play();
          console.log(`[Offscreen] Full desktop media stream active: ${video.videoWidth}x${video.videoHeight}`);
          resolve({ success: true, width: video.videoWidth, height: video.videoHeight });
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      };
    });
  } catch (err) {
    console.error('[Offscreen] Stream start error:', err);
    return { success: false, error: err.message };
  }
}

async function captureFrame() {
  try {
    const video = document.getElementById('screenVideo');
    if (!video || !video.videoWidth) {
      return { success: false, error: 'Video stream not ready' };
    }

    const canvas = document.getElementById('screenCanvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
    return { success: true, dataUrl, width: canvas.width, height: canvas.height };
  } catch (err) {
    console.error('[Offscreen] Frame capture error:', err);
    return { success: false, error: err.message };
  }
}
