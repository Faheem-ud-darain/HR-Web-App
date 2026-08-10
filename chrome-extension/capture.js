// Delcargo HR Tracker — Full Desktop Screen Capture Tab
// Uses getDisplayMedia() — the correct modern API for true full-screen capture.
// The old chooseDesktopMedia + getUserMedia(streamId) path has been removed
// because it frequently captures the picker UI or the wrong window on Windows/Mac.

let desktopStream = null;

document.addEventListener('DOMContentLoaded', () => {
  const startBtn      = document.getElementById('startBtn');
  const instructionText = document.getElementById('instructionText');
  const activeBadge   = document.getElementById('activeBadge');
  const resText       = document.getElementById('resText');
  const keepOpenBox   = document.getElementById('keepOpenBox');

  // ── Answer frame-capture requests from the background service worker ──────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'CAPTURE_DESKTOP_FRAME') {
      captureDesktopFrame().then(sendResponse);
      return true; // keep channel open for async response
    }
  });

  // ── Warn before the tab is closed ────────────────────────────────────────
  window.addEventListener('beforeunload', (e) => {
    if (desktopStream && desktopStream.active) {
      e.preventDefault();
      e.returnValue = 'Closing this tab will stop full desktop screen capture.';
    }
  });

  // ── When tab is closed/navigated away: clear the granted flag ─────────────
  window.addEventListener('unload', () => {
    // Stop the tracks so OS releases the camera-indicator light
    if (desktopStream) desktopStream.getTracks().forEach(t => t.stop());
    try { chrome.storage.local.set({ desktopStreamGranted: false }); } catch (_) {}
  });

  // ── Button / auto-start ───────────────────────────────────────────────────
  startBtn.addEventListener('click', requestCapture);
  // Auto-open the picker when the tab first loads (user must click Share)
  requestCapture();

  async function requestCapture() {
    startBtn.disabled = true;
    startBtn.textContent = 'Waiting for screen selection…';
    instructionText.textContent =
      'A system picker will open — select "Entire Screen" (or "Screen 1") and click Share.';

    // Stop any existing stream first
    if (desktopStream) {
      desktopStream.getTracks().forEach(t => t.stop());
      desktopStream = null;
    }

    try {
      // getDisplayMedia is the correct modern API. It:
      //  • Works on Windows, Mac, and Chrome OS.
      //  • Shows the OS-level screen picker (not Chrome's internal one).
      //  • Reliably captures the ENTIRE monitor when the user picks "Screen" / "Entire Screen".
      //  • Does NOT capture the picker UI itself.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',   // hint: prefer full-monitor over window/tab
          frameRate: { ideal: 5, max: 10 }, // low fps is enough for screenshots
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
        // Chrome 107+: suppress the "tab" option in the picker so only
        // "Entire Screen" and "Window" are offered.
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        systemAudio: 'exclude',
      });

      activateStream(stream);
    } catch (err) {
      // User hit Cancel or OS denied permission
      showIdle(err.name === 'NotAllowedError'
        ? 'Screen selection was cancelled or denied. Click the button to try again.'
        : `Error: ${err.message || err}`);
    }
  }

  function activateStream(stream) {
    desktopStream = stream;

    // React to the user clicking Chrome's floating "Stop sharing" banner
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
      try {
        await video.play();
      } catch (_) { /* autoplay — muted, should always succeed */ }

      const w = video.videoWidth  || 1920;
      const h = video.videoHeight || 1080;
      const res = `${w}×${h}`;

      // Confirm the surface type so we can show the user what was captured
      const surface = track?.getSettings?.()?.displaySurface ?? 'unknown';
      console.log(`[Capture] Stream active — surface: ${surface}, resolution: ${res}`);

      if (surface === 'browser' || surface === 'window') {
        // User picked a tab or individual window — warn and let them retry
        stream.getTracks().forEach(t => t.stop());
        showIdle(
          `You selected a ${surface === 'browser' ? 'tab' : 'window'} instead of the entire screen. ` +
          'Please click the button and choose "Entire Screen" (or "Screen 1") in the picker.'
        );
        return;
      }

      // ✅ Whole-screen selected — save state and update UI
      chrome.storage.local.set({ desktopStreamGranted: true, desktopResolution: res });

      startBtn.style.display       = 'none';
      instructionText.style.display = 'none';
      activeBadge.style.display    = 'inline-flex';
      keepOpenBox.style.display    = 'block';
      resText.textContent          = `Full Desktop Monitor Active (${res})`;
    };
  }

  function showIdle(msg) {
    if (desktopStream) { desktopStream.getTracks().forEach(t => t.stop()); desktopStream = null; }
    startBtn.disabled             = false;
    startBtn.style.display        = 'block';
    startBtn.textContent          = 'Select Entire Screen';
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
