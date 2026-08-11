// Delcargo HR Tracker — Background Service Worker (Manifest V3)
// Automatic active shift detection, idle tracking, heartbeats, screen captures,
// and 37-minute continuous idle auto clock-out on ChromeOS & Chrome browser.

const DEFAULT_SERVER_URL = 'https://pb.delcargo.us';
const INACTIVITY_REPORT_SECONDS = 180; // 3 minutes — loggable idle threshold
const AUTO_ABSENT_INACTIVITY_SECONDS = 37 * 60; // 37 minutes — continuous idle auto clock-out

function getHeartbeatKey(email) {
  return 'tracker_heartbeat_' + (email || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

// Initial Alarm Setup (Default: 1 minute screenshot interval)
try {
  chrome.idle.setDetectionInterval(180);
  chrome.alarms.create('tracker_heartbeat', { periodInMinutes: 0.25 }); // every 15 sec
  chrome.alarms.create('tracker_screenshot', { periodInMinutes: 1 });  // 1 min default
} catch (e) {
  console.error('[Delcargo Tracker] Alarm setup error:', e);
}

// Ensure Offscreen Document exists for full desktop MediaStream capture
async function ensureOffscreenDocument() {
  try {
    const existing = await chrome.offscreen.hasDocument();
    if (!existing) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['DISPLAY_MEDIA', 'USER_MEDIA'],
        justification: 'Capture full desktop screen for HR activity logging'
      });
      console.log('[Delcargo Tracker] Offscreen capture document created.');
    }
  } catch (err) {
    console.error('[Delcargo Tracker] Offscreen document creation error:', err);
  }
}

// ── Top-level Event Listeners (Manifest V3 Requirement) ─────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Delcargo Tracker] Extension installed.');
  ensureOffscreenDocument();
  handleHeartbeatTick();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'HEARTBEAT_NOW') {
    console.log('[Delcargo Tracker] Immediate heartbeat requested by UI.');
    handleHeartbeatTick()
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }
  if (msg && msg.type === 'INIT_DESKTOP_STREAM') {
    (async () => {
      await ensureOffscreenDocument();
      await new Promise(r => setTimeout(r, 150));
      chrome.runtime.sendMessage({ type: 'START_SCREEN_STREAM', streamId: msg.streamId }, (offscreenRes) => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.error('[Delcargo Tracker] Offscreen message error:', err.message);
          sendResponse({ success: false, error: err.message });
        } else {
          console.log('[Delcargo Tracker] Offscreen stream init response:', offscreenRes);
          sendResponse(offscreenRes || { success: false, error: 'No response from offscreen document' });
        }
      });
    })();
    return true;
  }
  if (msg && msg.type === 'DISCONNECT_DEVICE') {
    getStorageData().then(async (data) => {
      if (data.employeeEmail) {
        const serverUrl = (data.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
        const email = data.employeeEmail.trim().toLowerCase();
        await pbDeleteKV(serverUrl, getHeartbeatKey(email));
      }
      sendResponse({ success: true });
    });
    return true;
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  console.log('[Delcargo Tracker] Alarm fired:', alarm.name);
  if (alarm.name === 'tracker_heartbeat') {
    handleHeartbeatTick();
  } else if (alarm.name === 'tracker_screenshot') {
    handleScreenshotTick();
  }
});

// Storage Helper
async function getStorageData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        'employeeEmail',
        'serverUrl',
        'agentToken',
        'shiftActive',
        'shiftStartTime',
        'idleStartTimestamp',
        'autoAbsentFired',
        'lastScreenshotTime',
        'screenshotIntervalMinutes'
      ],
      (res) => resolve(res)
    );
  });
}

// ── PocketBase REST Helpers ────────────────────────────────────────────────
async function pbSetKV(serverUrl, key, value) {
  const cleanUrl = (serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
  const filter = encodeURIComponent(`key = "${key}"`);
  const getUrl = `${cleanUrl}/api/collections/hr_delcargo_store/records?filter=${filter}`;

  const listRes = await fetch(getUrl, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  }).catch(() => null);

  if (!listRes || !listRes.ok) return;

  const listData = await listRes.json().catch(() => null);
  const existingRecord = listData?.items?.[0];

  const body = JSON.stringify({ key, value });
  if (existingRecord?.id) {
    await fetch(`${cleanUrl}/api/collections/hr_delcargo_store/records/${existingRecord.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body
    }).catch(() => null);
  } else {
    await fetch(`${cleanUrl}/api/collections/hr_delcargo_store/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    }).catch(() => null);
  }
}

async function pbGetKV(serverUrl, key) {
  const cleanUrl = (serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
  const filter = encodeURIComponent(`key = "${key}"`);
  const listRes = await fetch(`${cleanUrl}/api/collections/hr_delcargo_store/records?filter=${filter}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  }).catch(() => null);

  if (!listRes || !listRes.ok) return null;
  const listData = await listRes.json().catch(() => null);
  return listData?.items?.[0]?.value || null;
}

async function pbDeleteKV(serverUrl, key) {
  const cleanUrl = (serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
  const filter = encodeURIComponent(`key = "${key}"`);
  const listRes = await fetch(`${cleanUrl}/api/collections/hr_delcargo_store/records?filter=${filter}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  }).catch(() => null);

  if (!listRes || !listRes.ok) return;
  const listData = await listRes.json().catch(() => null);
  const existingRecord = listData?.items?.[0];
  if (existingRecord?.id) {
    await fetch(`${cleanUrl}/api/collections/hr_delcargo_store/records/${existingRecord.id}`, {
      method: 'DELETE'
    }).catch(() => null);
  }
}

// ── Automatic Active Shift Checker (Matches desktop agent check_active_shift) ─
async function checkActiveShift(serverUrl, email) {
  const cleanUrl = (serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
  const res = await fetch(`${cleanUrl}/api/collections/hr_timesheets/records?filter=${encodeURIComponent('clock_out = ""')}&perPage=200`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  }).catch(() => null);

  if (!res || !res.ok) return null;
  const data = await res.json().catch(() => null);
  const items = data?.items || [];
  const wanted = (email || '').trim().toLowerCase();

  const openRecord = items.find(it => (it.employee_id || '').trim().toLowerCase() === wanted);
  return openRecord || null;
}

// ── Heartbeat & Shift Tick Handler ─────────────────────────────────────────
async function handleHeartbeatTick() {
  const data = await getStorageData();
  if (!data.employeeEmail) return;

  const serverUrl = (data.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
  const email = data.employeeEmail.trim().toLowerCase();
  const nowIso = new Date().toISOString();
  const heartbeatKey = getHeartbeatKey(email);
  const deviceId = data.deviceId || ('chromebook_' + email.replace(/[^a-z0-9]/g, '_'));

  // 1. ALWAYS upload live tracker heartbeat while extension is connected
  try {
    const existingHb = await pbGetKV(serverUrl, heartbeatKey);
    
    // Check if superseded by another device
    if (existingHb && existingHb.deviceId && existingHb.deviceId !== deviceId) {
      console.warn(`[Delcargo Tracker] Superseded by device: ${existingHb.deviceId}. Disconnecting...`);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Tracker Disconnected',
        message: 'Your profile was logged into another tracker. This extension has been disconnected.'
      });
      chrome.storage.local.clear(() => {
        chrome.runtime.reload();
      });
      return;
    }

    const connectedAt = existingHb?.connectedAt || nowIso;

    const hbValue = {
      employeeEmail: email,
      deviceId: deviceId,
      deviceLabel: 'Chromebook / Chrome OS',
      connectedAt: connectedAt,
      lastSeenAt: nowIso,
      agentVersion: '8'
    };

    await pbSetKV(serverUrl, heartbeatKey, hbValue);
    console.log(`[Delcargo Tracker] Heartbeat sent for ${email} (${nowIso})`);
  } catch (e) {
    console.error('[Delcargo Tracker] Heartbeat upload failed:', e);
  }

  // 2. Query real shift status on PocketBase (matches desktop tracker)
  const openShiftRecord = await checkActiveShift(serverUrl, email);
  const isShiftOpen = !!openShiftRecord;
  console.log(`[Delcargo Tracker] Shift active status: ${isShiftOpen}`);

  if (isShiftOpen) {
    const clockInIso = openShiftRecord.clock_in || nowIso;
    chrome.storage.local.set({
      shiftActive: true,
      shiftStartTime: clockInIso
    });

    // 3. Fetch custom screenshot interval setting from PocketBase (hr_tracking_settings_prod_v1)
    let intervalMinutes = 1;
    try {
      const settingsList = await pbGetKV(serverUrl, 'hr_tracking_settings_prod_v1');
      if (Array.isArray(settingsList)) {
        const empSetting = settingsList.find(s => s && (s.employeeEmail || '').toLowerCase() === email);
        if (empSetting && empSetting.intervalMinutes) {
          intervalMinutes = Math.max(1, parseInt(empSetting.intervalMinutes, 10) || 1);
        }
      }
    } catch (e) {
      console.error('[Delcargo Tracker] Fetch settings error:', e);
    }

    chrome.storage.local.set({ screenshotIntervalMinutes: intervalMinutes });

    // Check if screenshot is due
    const lastShot = data.lastScreenshotTime || 0;
    const intervalMs = intervalMinutes * 60 * 1000;
    if (Date.now() - lastShot >= intervalMs) {
      chrome.storage.local.set({ lastScreenshotTime: Date.now() });
      console.log('[Delcargo Tracker] Screenshot due -> capturing screen now...');
      handleScreenshotTick();
    }

    // 4. Live continuous 37+ minutes idle check (only during active shift)
    chrome.idle.queryState(180, async (state) => {
      if (state === 'idle' || state === 'locked') {
        const idleStart = data.idleStartTimestamp || Date.now();
        const continuousIdleSec = Math.floor((Date.now() - idleStart) / 1000);

        if (continuousIdleSec >= AUTO_ABSENT_INACTIVITY_SECONDS && !data.autoAbsentFired) {
          chrome.storage.local.set({ autoAbsentFired: true });
          await autoClockOut(serverUrl, email, 'inactivity_absence', continuousIdleSec);
        }
      }
    });

  } else {
    // Shift is not open (shift ended or not started yet) -> pause active shift flag
    if (data.shiftActive) {
      chrome.storage.local.set({ shiftActive: false, autoAbsentFired: false });
    }
  }
}

// ── Auto Clock Out / Shift Stop ───────────────────────────────────────────
async function autoClockOut(serverUrl, email, reason = 'tracker_closed', idleSeconds = 0) {
  try {
    const cleanUrl = (serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
    console.log(`[Delcargo Tracker] Auto clock-out triggered. Reason: ${reason}`);

    // 1. Clock out open timesheet record
    const openRecord = await checkActiveShift(cleanUrl, email);
    if (openRecord?.id) {
      const nowIso = new Date().toISOString();
      await fetch(`${cleanUrl}/api/collections/hr_timesheets/records/${openRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clock_out: nowIso, status: 'Completed' })
      });
    }

    // 2. Write shift_stop_signal for live web dashboard notification
    const signalKey = 'shift_stop_signal_' + email.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    await pbSetKV(cleanUrl, signalKey, {
      employeeEmail: email,
      timestamp: new Date().toISOString(),
      reason
    });

    // 3. Update local state
    chrome.storage.local.set({ shiftActive: false, autoAbsentFired: false });

    // 4. Native Chrome OS Notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Delcargo Shift Ended',
      message: reason === 'inactivity_absence'
        ? 'Your shift was automatically ended due to 37+ minutes of inactivity.'
        : 'Your shift has ended.'
    });
  } catch (err) {
    console.error('[Delcargo Tracker] autoClockOut failed:', err);
  }
}

// ── Idle State Changed Listener ───────────────────────────────────────────
chrome.idle.onStateChanged.addListener(async (newState) => {
  const data = await getStorageData();
  if (!data.shiftActive || !data.employeeEmail) return;

  const serverUrl = (data.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
  const email = data.employeeEmail.trim().toLowerCase();
  const now = Date.now();

  if (newState === 'idle' || newState === 'locked') {
    chrome.storage.local.set({ idleStartTimestamp: now });
  } else if (newState === 'active') {
    const idleStart = data.idleStartTimestamp;
    chrome.storage.local.set({ idleStartTimestamp: null, autoAbsentFired: false });

    if (idleStart) {
      const durationSeconds = Math.floor((now - idleStart) / 1000);
      if (durationSeconds >= INACTIVITY_REPORT_SECONDS) {
        await uploadInactivityLog(serverUrl, email, new Date(idleStart).toISOString(), new Date(now).toISOString(), durationSeconds);
      }
    }
  }
});

// Upload completed inactivity interval to hr_inactivity_logs
async function uploadInactivityLog(serverUrl, email, startIso, endIso, durationSeconds) {
  try {
    const cleanUrl = (serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
    await fetch(`${cleanUrl}/api/collections/hr_inactivity_logs/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_email: email,
        start_at: startIso,
        end_at: endIso,
        duration_seconds: String(durationSeconds),
        device_label: 'Chromebook / Chrome OS'
      })
    });
    console.log(`[Delcargo Tracker] Logged ${Math.round(durationSeconds / 60)} min inactivity.`);
  } catch (err) {
    console.error('[Delcargo Tracker] Failed to upload inactivity log:', err);
  }
}

// Helper to convert Data URL to Blob for multipart upload
function dataUrlToBlob(dataUrl) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// ── Screen Capture Tick (Full Desktop Monitor via Offscreen / VisibleTab) ───
async function handleScreenshotTick() {
  const data = await getStorageData();
  if (!data.shiftActive || !data.employeeEmail) return;

  const serverUrl = (data.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
  const email = data.employeeEmail.trim().toLowerCase();

  try {
    // 1. Query full desktop frame from active stream (capture page / offscreen)
    chrome.runtime.sendMessage({ type: 'CAPTURE_DESKTOP_FRAME' }, async (frameRes) => {
      let dataUrl = null;
      let width = '1920';
      let height = '1080';

      if (frameRes && frameRes.success && frameRes.dataUrl) {
        dataUrl = frameRes.dataUrl;
        width = String(frameRes.width || 1920);
        height = String(frameRes.height || 1080);
        console.log(`[Delcargo Tracker] Capturing FULL DESKTOP MONITOR display (${width}x${height})...`);
      } else {
        // 2. Fallback to visible tab capture if full desktop stream tab is not open
        dataUrl = await new Promise((resolve) => {
          chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
            const activeTab = tabs?.[0];
            const windowId = activeTab?.windowId || null;
            if (activeTab) {
              width = String(activeTab.width || 1920);
              height = String(activeTab.height || 1080);
            }
            chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 65 }, (url) => {
              if (chrome.runtime.lastError) resolve(null);
              else resolve(url);
            });
          });
        });
      }

      if (!dataUrl) return;

      const blob = dataUrlToBlob(dataUrl);
      const filename = `scr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;

      const formData = new FormData();
      formData.append('employee_email', email);
      formData.append('captured_at', new Date().toISOString());
      formData.append('width', width);
      formData.append('height', height);
      formData.append('device_label', frameRes?.success ? 'Chromebook / Chrome OS (Full Desktop Screen)' : 'Chromebook / Chrome OS');
      formData.append('image', blob, filename);

      const resp = await fetch(`${serverUrl}/api/collections/hr_screenshots/records`, {
        method: 'POST',
        body: formData
      }).catch(() => null);

      if (resp && resp.ok) {
        chrome.storage.local.set({ lastScreenshotTime: Date.now() });
        console.log('[Delcargo Tracker] Full Desktop Screenshot captured & uploaded successfully.');
      }
    });
  } catch (e) {
    console.warn('[Delcargo Tracker] Screenshot tick exception:', e);
  }
}

// ── Automatic Extension Update Check & Listener ────────────────────────────
chrome.runtime.onUpdateAvailable.addListener((details) => {
  console.log('[Delcargo Tracker] Extension update available:', details.version);
  chrome.runtime.reload();
});

function checkForUpdates() {
  if (chrome.runtime.requestUpdateCheck) {
    chrome.runtime.requestUpdateCheck((status) => {
      console.log('[Delcargo Tracker] Update check status:', status);
      if (status === 'update_available') {
        chrome.runtime.reload();
      }
    });
  }
}

try {
  chrome.alarms.create('checkUpdatesAlarm', { periodInMinutes: 60 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkUpdatesAlarm') {
      checkForUpdates();
    }
  });
} catch (e) {
  console.warn('[Delcargo Tracker] Alarms setup exception:', e);
}

// ── Start Heartbeat Loop Immediately on Worker Evaluation ─────────────────
handleHeartbeatTick();
setInterval(() => {
  handleHeartbeatTick();
}, 10000); // Continuous 10-second polling & heartbeat tick
