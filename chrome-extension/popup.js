// Delcargo HR Tracker — Popup Controller

document.addEventListener('DOMContentLoaded', () => {
  const emailInput = document.getElementById('employeeEmail');
  const serverInput = document.getElementById('serverUrl');
  const toggleBtn = document.getElementById('toggleShiftBtn');
  const btnText = document.getElementById('btnText');
  const btnIcon = document.getElementById('btnIcon');
  const statusPill = document.getElementById('statusPill');
  const statusText = document.getElementById('statusText');
  const timerDisplay = document.getElementById('timerDisplay');
  const inputsForm = document.getElementById('inputsForm');

  let timerInterval = null;
  let isShiftActive = false;
  let shiftStartMs = 0;

  // Load Initial Storage State
  chrome.storage.local.get(['employeeEmail', 'serverUrl', 'shiftActive', 'shiftStartTime'], (res) => {
    if (res.employeeEmail) emailInput.value = res.employeeEmail;
    if (res.serverUrl) serverInput.value = res.serverUrl;

    if (res.shiftActive && res.shiftStartTime) {
      isShiftActive = true;
      shiftStartMs = new Date(res.shiftStartTime).getTime();
      updateUiActive();
      startTimer();
    } else {
      updateUiInactive();
    }
  });

  // Toggle Shift Button Click
  toggleBtn.addEventListener('click', () => {
    const email = emailInput.value.trim();
    const serverUrl = serverInput.value.trim() || 'https://pb.delcargo.us';

    if (!email) {
      alert('Please enter your employee email address.');
      emailInput.focus();
      return;
    }

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
      // STOP SHIFT
      if (confirm('Are you sure you want to end your shift?')) {
        chrome.runtime.sendMessage({ type: 'STOP_SHIFT' }, (resp) => {
          if (resp && resp.success) {
            isShiftActive = false;
            stopTimer();
            updateUiInactive();
          }
        });
      }
    }
  });

  function updateUiActive() {
    statusPill.className = 'status-pill status-online';
    statusText.textContent = 'Active Shift';
    toggleBtn.className = 'btn btn-active';
    btnIcon.textContent = '■';
    btnText.textContent = 'End Shift';
    emailInput.disabled = true;
    serverInput.disabled = true;
  }

  function updateUiInactive() {
    statusPill.className = 'status-pill status-offline';
    statusText.textContent = 'Offline';
    toggleBtn.className = 'btn btn-primary';
    btnIcon.textContent = '▶';
    btnText.textContent = 'Start Shift';
    emailInput.disabled = false;
    serverInput.disabled = false;
    timerDisplay.textContent = '00:00:00';
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
