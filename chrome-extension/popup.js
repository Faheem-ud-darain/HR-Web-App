// Delcargo HR Tracker — Popup Controller (Personal Setup Code Auth)

document.addEventListener('DOMContentLoaded', () => {
  const setupView = document.getElementById('setupView');
  const mainView = document.getElementById('mainView');
  const setupCodeInput = document.getElementById('setupCodeInput');
  const connectCodeBtn = document.getElementById('connectCodeBtn');
  const setupError = document.getElementById('setupError');

  const displayEmail = document.getElementById('displayEmail');
  const toggleShiftBtn = document.getElementById('toggleShiftBtn');
  const btnText = document.getElementById('btnText');
  const btnIcon = document.getElementById('btnIcon');
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
    chrome.storage.local.get(['employeeEmail', 'serverUrl', 'agentToken', 'shiftActive', 'shiftStartTime'], (res) => {
      if (res.agentToken && res.employeeEmail) {
        // Device Connected with Setup Code
        setupView.style.display = 'none';
        mainView.style.display = 'block';
        displayEmail.textContent = res.employeeEmail;

        if (res.shiftActive && res.shiftStartTime) {
          isShiftActive = true;
          shiftStartMs = new Date(res.shiftStartTime).getTime();
          updateUiActive();
          startTimer();
        } else {
          updateUiConnected();
        }
      } else {
        // Disconnected — Show Setup Screen
        setupView.style.display = 'block';
        mainView.style.display = 'none';
        updateUiDisconnected();
      }
    });
  }

  loadState();

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

      // Fetch tracking settings array from PocketBase KV store (key: "hr_tracking_settings_prod_v1")
      const kvResp = await fetch(`${serverUrl}/api/collections/hr_delcargo_store/records?filter=${encodeURIComponent('key="hr_tracking_settings_prod_v1"')}`);
      
      if (!kvResp.ok) throw new Error('Could not reach server. Please check your network connection.');

      const kvData = await kvResp.json();
      const settingsList = kvData?.items?.[0]?.value;

      if (!Array.isArray(settingsList)) {
        throw new Error("Could not retrieve tracker settings from server.");
      }

      // Find setting record matching this setup code's token
      const matchedSetting = settingsList.find(s => s && s.agentToken === token);

      if (!matchedSetting || !matchedSetting.employeeEmail) {
        throw new Error("This setup code is not recognized. Please ask HR/Admin for a fresh setup code from the Tracker Setup screen.");
      }

      const email = matchedSetting.employeeEmail.toLowerCase();

      // Save connection credentials
      chrome.storage.local.set({
        employeeEmail: email,
        serverUrl: serverUrl,
        agentToken: token
      }, () => {
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

  // ── Toggle Start/End Shift ─────────────────────────────────────────────
  toggleShiftBtn.addEventListener('click', () => {
    chrome.storage.local.get(['employeeEmail', 'serverUrl'], (res) => {
      const email = res.employeeEmail;
      const serverUrl = res.serverUrl || 'https://pb.delcargo.us';

      if (!isShiftActive) {
        // START SHIFT
        chrome.runtime.sendMessage({ type: 'START_SHIFT', email, serverUrl }, (resp) => {
          if (resp && resp.success) {
            isShiftActive = true;
            shiftStartMs = Date.now();
            updateUiActive();
            startTimer();
          }
        });
      } else {
        // END SHIFT
        if (confirm('Are you sure you want to end your shift?')) {
          chrome.runtime.sendMessage({ type: 'STOP_SHIFT' }, (resp) => {
            if (resp && resp.success) {
              isShiftActive = false;
              stopTimer();
              updateUiConnected();
            }
          });
        }
      }
    });
  });

  // ── Disconnect Device ─────────────────────────────────────────────────
  disconnectBtn.addEventListener('click', () => {
    if (confirm('Disconnect this Chromebook from your account? You will need a new Setup Code to reconnect.')) {
      if (isShiftActive) {
        chrome.runtime.sendMessage({ type: 'STOP_SHIFT' });
      }
      chrome.storage.local.clear(() => {
        stopTimer();
        loadState();
      });
    }
  });

  function updateUiConnected() {
    statusPill.className = 'status-pill status-offline';
    statusText.textContent = 'Ready';
    toggleShiftBtn.className = 'btn btn-primary';
    btnIcon.textContent = '▶';
    btnText.textContent = 'Start Shift';
    timerDisplay.textContent = '00:00:00';
  }

  function updateUiActive() {
    statusPill.className = 'status-pill status-online';
    statusText.textContent = 'Active Shift';
    toggleShiftBtn.className = 'btn btn-active';
    btnIcon.textContent = '■';
    btnText.textContent = 'End Shift';
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
