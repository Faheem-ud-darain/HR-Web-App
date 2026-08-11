// Delcargo HR Tracker — Popup Controller (Desktop Tracker Behavior)

document.addEventListener('DOMContentLoaded', () => {
  const setupView = document.getElementById('setupView');
  const mainView = document.getElementById('mainView');
  const setupCodeInput = document.getElementById('setupCodeInput');
  const connectCodeBtn = document.getElementById('connectCodeBtn');
  const setupError = document.getElementById('setupError');

  const displayEmail = document.getElementById('displayEmail');
  const trackingStateCard = document.getElementById('trackingStateCard');
  const stateIcon = document.getElementById('stateIcon');
  const stateTitle = document.getElementById('stateTitle');
  const stateSubtitle = document.getElementById('stateSubtitle');
  const grantScreenBtn = document.getElementById('grantScreenBtn');
  const screenCaptureBadge = document.getElementById('screenCaptureBadge');
  const screenDesc = document.getElementById('screenDesc');

  const disconnectBtn = document.getElementById('disconnectBtn');
  const statusPill = document.getElementById('statusPill');
  const statusText = document.getElementById('statusText');
  const timerDisplay = document.getElementById('timerDisplay');

  let timerInterval = null;
  let isShiftActive = false;
  let shiftStartMs = 0;

  // ── Decode Setup Code ──────────────────────────────────────────────────
  function decodeSetupCode(codeStr) {
    try {
      let code = (codeStr || '').trim();
      code = code.replace(/\s+/g, '');
      const padded = code + '='.repeat((4 - (code.length % 4)) % 4);
      const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
      const jsonStr = atob(base64);
      const obj = JSON.parse(jsonStr);
      if (obj && obj.u && obj.t) {
        return { serverUrl: obj.u, token: obj.t };
      }
    } catch (e) {
      console.error('Decode failed:', e);
    }
    return null;
  }

  // ── Load Storage State ─────────────────────────────────────────────────
  function loadState() {
    chrome.storage.local.get(['employeeEmail', 'serverUrl', 'agentToken', 'shiftActive', 'shiftStartTime', 'desktopStreamGranted', 'desktopResolution'], (res) => {
      if (res.agentToken && res.employeeEmail) {
        setupView.style.display = 'none';
        mainView.style.display = 'block';
        displayEmail.textContent = res.employeeEmail;

        // Test if desktop stream capture tab is currently active and live
        chrome.runtime.sendMessage({ type: 'CAPTURE_DESKTOP_FRAME' }, (frameRes) => {
          if (frameRes && frameRes.success) {
            grantScreenBtn.style.display = 'none';
            screenCaptureBadge.style.display = 'flex';
            const resStr = frameRes.width ? `${frameRes.width}x${frameRes.height}` : (res.desktopResolution || 'Active');
            screenDesc.textContent = `Entire monitor display active (${resStr})`;
          } else {
            // Stream tab was closed or stopped — restore button so user can re-open!
            grantScreenBtn.style.display = 'flex';
            grantScreenBtn.textContent = '🖥️ Select Entire Desktop Screen';
            screenCaptureBadge.style.display = 'none';
          }
        });

        if (res.shiftActive && res.shiftStartTime) {
          isShiftActive = true;
          shiftStartMs = new Date(res.shiftStartTime).getTime();
          updateUiActive();
          startTimer();
        } else {
          isShiftActive = false;
          stopTimer();
          updateUiPaused();
        }
      } else {
        setupView.style.display = 'block';
        mainView.style.display = 'none';
        updateUiDisconnected();
      }
    });
  }

  loadState();
  setInterval(loadState, 3000);

  // ── Grant / Re-select Full Desktop Screen Capture ─────────────────────
  function openCaptureWindow() {
    // Open as a small popup window (not a tab) so it can be auto-minimized
    // by capture.js after the stream starts, leaving the desktop visible.
    chrome.windows.create({
      url: chrome.runtime.getURL('capture.html'),
      type: 'popup',
      width: 520,
      height: 480,
      focused: true
    });
  }

  grantScreenBtn.addEventListener('click', openCaptureWindow);
  screenCaptureBadge.addEventListener('click', openCaptureWindow);

  // ── Connect Device via Setup Code ──────────────────────────────────────
  connectCodeBtn.addEventListener('click', async () => {
    setupError.style.display = 'none';
    const rawCode = setupCodeInput.value.trim();

    if (!rawCode) {
      showError('Please paste your Personal Setup Code.');
      return;
    }

    const decoded = decodeSetupCode(rawCode);
    if (!decoded) {
      showError("Invalid setup code format. Please copy a fresh setup code from HR/Admin (Tracker Setup screen).");
      return;
    }

    connectCodeBtn.disabled = true;
    connectCodeBtn.textContent = 'Verifying Code...';

    try {
      const serverUrl = (decoded.serverUrl || 'https://pb.delcargo.us').replace(/\/+$/, '');
      const token = decoded.token;

      const kvResp = await fetch(`${serverUrl}/api/collections/hr_delcargo_store/records?filter=${encodeURIComponent('key="hr_tracking_settings_prod_v1"')}`);
      if (!kvResp.ok) throw new Error('Could not reach server. Please check your network connection.');

      const kvData = await kvResp.json();
      const settingsList = kvData?.items?.[0]?.value;

      if (!Array.isArray(settingsList)) {
        throw new Error("Could not retrieve tracker settings from server.");
      }

      const matchedSetting = settingsList.find(s => s && s.agentToken === token);
      if (!matchedSetting || !matchedSetting.employeeEmail) {
        throw new Error("This setup code is not recognized. Please ask HR/Admin for a fresh setup code from the Tracker Setup screen.");
      }

      const email = matchedSetting.employeeEmail.toLowerCase();

      const deviceId = self.crypto.randomUUID ? self.crypto.randomUUID() : 'ext_' + Math.random().toString(36).substring(2) + Date.now().toString(36);

      chrome.storage.local.set({
        employeeEmail: email,
        serverUrl: serverUrl,
        agentToken: token,
        shiftActive: false,
        deviceId: deviceId
      }, () => {
        chrome.runtime.sendMessage({ type: 'HEARTBEAT_NOW' });
        setupCodeInput.value = '';
        connectCodeBtn.disabled = false;
        connectCodeBtn.textContent = 'Connect Device';
        loadState();
      });
    } catch (err) {
      showError(err.message || 'Verification failed. Please check your internet connection.');
      connectCodeBtn.disabled = false;
      connectCodeBtn.textContent = 'Connect Device';
    }
  });

  function showError(msg) {
    setupError.textContent = msg;
    setupError.style.display = 'block';
  }

  // ── Disconnect Device ─────────────────────────────────────────────────
  disconnectBtn.addEventListener('click', () => {
    if (confirm('Disconnect this Chromebook from your account? You will need a new Setup Code to reconnect.')) {
      chrome.runtime.sendMessage({ type: 'DISCONNECT_DEVICE' }, () => {
        chrome.storage.local.clear(() => {
          stopTimer();
          loadState();
        });
      });
    }
  });

  function updateUiPaused() {
    statusPill.className = 'status-pill status-offline';
    statusText.textContent = 'Shift Paused';
    trackingStateCard.className = 'tracking-state-card state-paused';
    stateIcon.textContent = '⏸️';
    stateTitle.textContent = 'Shift Paused';
    stateSubtitle.textContent = 'Start shift from Web Portal';
    timerDisplay.textContent = '00:00:00';
  }

  function updateUiActive() {
    statusPill.className = 'status-pill status-active';
    statusText.textContent = 'Tracking Active';
    trackingStateCard.className = 'tracking-state-card state-active';
    stateIcon.textContent = '🟢';
    stateTitle.textContent = 'Tracking Active';
    stateSubtitle.textContent = 'Shift in progress';
  }

  function updateUiDisconnected() {
    statusPill.className = 'status-pill status-offline';
    statusText.textContent = 'Disconnected';
  }

  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    updateTimerText();
    timerInterval = setInterval(updateTimerText, 1000);
  }

  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }

  function updateTimerText() {
    if (!shiftStartMs) return;
    const elapsedSec = Math.floor((Date.now() - shiftStartMs) / 1000);
    const hrs = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
    const mins = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
    const secs = String(elapsedSec % 60).padStart(2, '0');
    timerDisplay.textContent = `${hrs}:${mins}:${secs}`;
  }
});
