// Delcargo HR Tracker — Full Desktop Screen Capture
// Uses getDisplayMedia() and then auto-minimizes this window so that the
// captured stream shows the employee's actual desktop, not the capture UI.

let desktopStream = null;

document.addEventListener('DOMContentLoaded', () => {
  const startBtn        = document.getElementById('startBtn');
  const instructionText = document.getElementById('instructionText');
  const activeBadge    = document.getElementById('activeBadge');
  const resText        = document.getElementById('resText');
  const keepOpenBox    = document.getElementById('keepOpenBox');

  // ── Answer frame-capture requests from the background service worker ──────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'CAPTURE_DESKTOP_FRAME') {
      captureDesktopFrame().then(sendResponse);
      return true;
    }
  });

  // ── When tab/window is closed: clear the granted flag and stop stream ─────
  window.addEventListener('beforeunload', () => {
    if (desktopStream) desktopStream.getTracks().forEach(t => t.stop());
    try { chrome.storage.local.set({ desktopStreamGranted: false }); } catch (_) {}
  });

  startBtn.addEventListener('click', requestCapture);

  async function requestCapture() {
    startBtn.disabled = true;
    startBtn.textContent = 'Waiting for screen selection…';
    instructionText.textContent =
      'Select "Entire Screen" (or "Screen 1") in the picker — NOT a tab or window — then click Share.';

    if (desktopStream) {
      desktopStream.getTracks().forEach(t => t.stop());
      desktopStream = null;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          frameRate: { ideal: 5, max: 10 },
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        systemAudio: 'exclude',
      });
      activateStream(stream);
    } catch (err) {
      showIdle(
        err.name === 'NotAllowedError'
          ? 'Screen selection was cancelled. Click the button to try again.'
          : `Error: ${err.message || err}`
      );
    }
  }

  function activateStream(stream) {
    desktopStream = stream;

    const track = stream.getVideoTracks()[0];
    if (track) {
      track.addEventListener('ended', () => {
        try { chrome.storage.local.set({ desktopStreamGranted: false }); } catch (_) {}
        showIdle('Screen sharing was stopped. Click the button to restart full desktop capture.');
      });
    }

    const video = document.getElementById('screenVideo');
    video.muted = true;
    video.srcObject = stream;

    video.onloadedmetadata = async () => {
      try { await video.play(); } catch (_) {}

      const w = video.videoWidth  || 1920;
      const h = video.videoHeight || 1080;
      const res = `${w}×${h}`;
      const surface = track?.getSettings?.()?.displaySurface ?? 'monitor';

      console.log(`[Capture] Stream active — surface: ${surface}, res: ${res}`);

      // Reject if the user picked a tab or single window instead of the full screen
      if (surface === 'browser' || surface === 'window') {
        stream.getTracks().forEach(t => t.stop());
        showIdle(
          `You selected a ${surface === 'browser' ? 'browser tab' : 'window'} — ` +
          'please click the button and choose "Entire Screen" (or "Screen 1") in the picker.'
        );
        return;
      }

      // ✅ Full screen selected — update UI
      chrome.storage.local.set({ desktopStreamGranted: true, desktopResolution: res });

      startBtn.style.display        = 'none';
      instructionText.style.display = 'none';
      activeBadge.style.display     = 'inline-flex';
      keepOpenBox.style.display     = 'block';
      resText.textContent           = `Full Desktop Monitor Active (${res})`;

      // ── KEY FIX: auto-minimize this popup window so the captured stream
      // shows the employee's actual work apps, not this UI.
      setTimeout(() => {
        try {
          chrome.windows.getCurrent((win) => {
            if (win && win.id) {
              chrome.windows.update(win.id, { state: 'minimized' });
            }
          });
        } catch (_) {}
      }, 2000);

      // ── MANIFEST V3 KEEPALIVE ──
      // Service workers suspend after 30s. `chrome.alarms` can be heavily throttled
      // by Chrome OS / Windows when on battery. Since this capture window stays open
      // (minimized) during the whole shift, we use its DOM interval to ping the
      // background script. This guarantees the service worker stays awake and the
      // server gets heartbeats on time, preventing false "Tracker Off" warnings.
      if (window.keepAliveInterval) clearInterval(window.keepAliveInterval);
      window.keepAliveInterval = setInterval(() => {
        chrome.runtime.sendMessage({ type: 'HEARTBEAT_NOW' }).catch(() => {});
      }, 25000);
    };
  }

  function showIdle(msg) {
    if (window.keepAliveInterval) {
      clearInterval(window.keepAliveInterval);
      window.keepAliveInterval = null;
    }
    if (desktopStream) { desktopStream.getTracks().forEach(t => t.stop()); desktopStream = null; }
    startBtn.disabled             = false;
    startBtn.style.display        = 'block';
    startBtn.textContent          = '🖥️ Select Entire Screen';
    instructionText.style.display = 'block';
    instructionText.textContent   = msg;
    activeBadge.style.display     = 'none';
    keepOpenBox.style.display     = 'none';
  }

  // ── Frame capture: called by background.js on each screenshot tick ────────
  async function captureDesktopFrame() {
    const video = document.getElementById('screenVideo');
    if (!desktopStream?.active || !video?.videoWidth) {
      return { success: false, error: 'Desktop stream not active' };
    }
    try {
      const canvas = document.getElementById('screenCanvas');
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      return {
        success: true,
        dataUrl: canvas.toDataURL('image/jpeg', 0.7),
        width:   canvas.width,
        height:  canvas.height,
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
});
