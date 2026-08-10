// Delcargo HR Tracker — Dedicated Full Desktop Monitor Stream Handler

let desktopStream = null;

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const instructionText = document.getElementById('instructionText');
  const activeBadge = document.getElementById('activeBadge');
  const resText = document.getElementById('resText');
  const keepOpenBox = document.getElementById('keepOpenBox');

  // Register Message Listener for Frame Requests from Background Worker
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'CAPTURE_DESKTOP_FRAME') {
      captureDesktopFrame().then(res => sendResponse(res));
      return true;
    }
  });

  // Warn user if closing tab while stream is active
  window.addEventListener('beforeunload', (e) => {
    if (desktopStream && desktopStream.active) {
      e.preventDefault();
      e.returnValue = 'Closing this tab will stop full desktop screen tracking.';
      return e.returnValue;
    }
  });

  // Mark desktopStreamGranted as false when tab unloads
  window.addEventListener('unload', () => {
    chrome.storage.local.set({ desktopStreamGranted: false });
  });

  startBtn.addEventListener('click', promptDesktopCapture);
  promptDesktopCapture();

  function promptDesktopCapture() {
    startBtn.disabled = true;
    startBtn.textContent = 'Awaiting Screen Selection...';

    if (chrome.desktopCapture && chrome.desktopCapture.chooseDesktopMedia) {
      chrome.desktopCapture.chooseDesktopMedia(['screen'], async (streamId) => {
        if (!streamId) {
          showError('Screen selection was cancelled. Click button below to try again.');
          return;
        }
        await initStream(streamId);
      });
    } else {
      navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' },
        audio: false
      }).then(async (stream) => {
        await activateStream(stream);
      }).catch(err => {
        showError(err.message || 'Screen selection failed.');
      });
    }
  }

  async function initStream(streamId) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: streamId
          }
        }
      });
      await activateStream(stream);
    } catch (err) {
      showError(err.message || 'Stream initialization error.');
    }
  }

  async function activateStream(stream) {
    try {
      if (desktopStream) {
        desktopStream.getTracks().forEach(t => t.stop());
      }
      desktopStream = stream;

      // Handle user clicking Chrome's "Stop sharing" floating banner
      const videoTrack = desktopStream.getVideoTracks()?.[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          chrome.storage.local.set({ desktopStreamGranted: false });
          showError('Screen sharing was stopped. Click button below to restart full desktop tracking.');
        };
      }

      const video = document.getElementById('screenVideo');
      video.muted = true;
      video.srcObject = desktopStream;

      video.onloadedmetadata = async () => {
        await video.play();
        const w = video.videoWidth || 1920;
        const h = video.videoHeight || 1080;
        const resStr = `${w}x${h}`;

        startBtn.style.display = 'none';
        instructionText.style.display = 'none';
        activeBadge.style.display = 'inline-flex';
        keepOpenBox.style.display = 'block';
        resText.textContent = `Full Desktop Monitor Active (${resStr})`;

        chrome.storage.local.set({
          desktopStreamGranted: true,
          desktopResolution: resStr
        });
        console.log(`[Capture Page] Full Desktop Stream active: ${resStr}`);
      };
    } catch (err) {
      showError(err.message || 'Video stream setup error.');
    }
  }

  function showError(msg) {
    startBtn.disabled = false;
    startBtn.style.display = 'block';
    startBtn.textContent = 'Select Entire Screen';
    instructionText.style.display = 'block';
    instructionText.textContent = msg;
    activeBadge.style.display = 'none';
    keepOpenBox.style.display = 'none';
  }

  async function captureDesktopFrame() {
    try {
      const video = document.getElementById('screenVideo');
      if (!video || !video.videoWidth || !desktopStream || !desktopStream.active) {
        return { success: false, error: 'Desktop stream not active' };
      }

      const canvas = document.getElementById('screenCanvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
      return { success: true, dataUrl, width: canvas.width, height: canvas.height };
    } catch (e) {
      console.error('[Capture Page] Frame capture error:', e);
      return { success: false, error: e.message };
    }
  }
});
