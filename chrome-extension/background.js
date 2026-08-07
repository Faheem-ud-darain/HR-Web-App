// Delcargo HR Tracker — Background Service Worker (Manifest V3)
// Handles idle detection, shift heartbeats, auto clock-out on 37+ min inactivity,
// and periodic screen captures on ChromeOS & Chrome browser.

const DEFAULT_SERVER_URL = 'https://pb.delcargo.us';
const INACTIVITY_REPORT_SECONDS = 180; // 3 minutes — loggable idle threshold
const AUTO_ABSENT_INACTIVITY_SECONDS = 37 * 60; // 37 minutes — continuous idle auto clock-out
const HEARTBEAT_INTERVAL_SECONDS = 15;
const SCREENSHOT_INTERVAL_MINUTES = 10;

// Setup alarms & idle detection on extension load/install
chrome.runtime.onInstalled.addListener(() => {
  chrome.idle.setDetectionInterval(180); // 3 minutes
  chrome.alarms.create('tracker_heartbeat', { periodInMinutes: 0.25 }); // every 15 sec
  chrome.alarms.create('tracker_screenshot', { periodInMinutes: SCREENSHOT_INTERVAL_MINUTES });
  console.log('[Delcargo Tracker] Extension installed & alarms initialized.');
});

// Alarm Listener
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'tracker_heartbeat') {
    await handleHeartbeatTick();
  } else if (alarm.name === 'tracker_screenshot') {
    await handleScreenshotTick();
  }
});

// Storage Helper
async function getStorageData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        'employeeEmail',
        'serverUrl',
        'shiftActive',
        'shiftStartTime',
        'idleStartTimestamp',
        'autoAbsentFired'
      ],
      (res) => resolve(res)
    );
  });
}

// ── PocketBase REST Helpers ────────────────────────────────────────────────
async function pbSetKV(serverUrl, key, value) {
  try {
    const listRes = await fetch(`${serverUrl}/api/collections/hr_delcargo_store/records?filter=(key='${key}')`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    const listData = await listRes.json();
    const existingRecord = listData?.items?.[0];

    const body = JSON.stringify({ key, value });
    if (existingRecord?.id) {
      await fetch(`${serverUrl}/api/collections/hr_delcargo_store/records/${existingRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body
      });
    } else {
      await fetch(`${serverUrl}/api/collections/hr_delcargo_store/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });
    }
  } catch (err) {
    console.error('[Delcargo Tracker] pbSetKV failed:', err);
  }
}

async function pbGetKV(serverUrl, key) {
  try {
    const listRes = await fetch(`${serverUrl}/api/collections/hr_delcargo_store/records?filter=(key='${key}')`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    const listData = await listRes.json();
    return listData?.items?.[0]?.value || null;
  } catch (err) {
    console.error('[Delcargo Tracker] pbGetKV failed:', err);
    return null;
  }
}

// ── Heartbeat Handler ──────────────────────────────────────────────────────
async function handleHeartbeatTick() {
  const data = await getStorageData();
  if (!data.shiftActive || !data.employeeEmail) return;

  const serverUrl = data.serverUrl || DEFAULT_SERVER_URL;
  const email = data.employeeEmail.toLowerCase();
  const nowIso = new Date().toISOString();

  // 1. Update live heartbeat KV
  try {
    const existingMap = (await pbGetKV(serverUrl, 'hr_tracker_heartbeats_prod_v1')) || {};
    existingMap[email] = {
      email,
      timestamp: nowIso,
      deviceLabel: 'Chromebook / Chrome OS'
    };
    await pbSetKV(serverUrl, 'hr_tracker_heartbeats_prod_v1', existingMap);
  } catch (e) {
    console.error('[Delcargo Tracker] Heartbeat upload failed:', e);
  }

  // 2. Check live continuous idle duration if currently idle
  chrome.idle.queryState(180, async (state) => {
    if (state === 'idle' || state === 'locked') {
      const idleStart = data.idleStartTimestamp || Date.now();
      const continuousIdleSec = Math.floor((Date.now() - idleStart) / 1000);

      // Continuous 37+ minutes idle threshold check
      if (continuousIdleSec >= AUTO_ABSENT_INACTIVITY_SECONDS && !data.autoAbsentFired) {
        chrome.storage.local.set({ autoAbsentFired: true });
        await autoClockOut(serverUrl, email, 'inactivity_absence', continuousIdleSec);
      }
    }
  });
}

// ── Auto Clock Out / Shift Stop ───────────────────────────────────────────
async function autoClockOut(serverUrl, email, reason = 'tracker_closed', idleSeconds = 0) {
  try {
    console.log(`[Delcargo Tracker] Auto clock-out triggered. Reason: ${reason}`);

    // 1. Clock out open timesheet record
    const tsRes = await fetch(`${serverUrl}/api/collections/hr_timesheets/records?filter=(employee_email='${email}'%26%26clock_out=null)`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    const tsData = await tsRes.json();
    const openRecord = tsData?.items?.[0];

    if (openRecord?.id) {
      const nowIso = new Date().toISOString();
      await fetch(`${serverUrl}/api/collections/hr_timesheets/records/${openRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clock_out: nowIso, status: 'Completed' })
      });
    }

    // 2. Write shift_stop_signal for live frontend web dashboard notification
    const signalKey = 'shift_stop_signal_' + email.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    await pbSetKV(serverUrl, signalKey, {
      employeeEmail: email,
      timestamp: new Date().toISOString(),
      reason
    });

    // 3. If inactivity absence, create real-time absence record
    if (reason === 'inactivity_absence') {
      const pktTodayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
      const recordId = `${email.toLowerCase()}_${pktTodayStr}`;
      const inactivityMinutes = Math.round(idleSeconds / 60);

      const existingAbsences = (await pbGetKV(serverUrl, 'hr_absence_records_v1')) || [];
      if (!existingAbsences.some(r => r.id === recordId)) {
        existingAbsences.push({
          id: recordId,
          employeeEmail: email,
          employeeName: email,
          date: pktTodayStr,
          reason: 'inactivity',
          inactivityMinutes,
          deductionAmount: 0, // calculate server-side
          createdAt: new Date().toISOString(),
          acknowledged: false
        });
        await pbSetKV(serverUrl, 'hr_absence_records_v1', existingAbsences);
      }
    }

    // 4. Update local state
    chrome.storage.local.set({ shiftActive: false, autoAbsentFired: false });

    // 5. Native Chrome OS Notification
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

  const serverUrl = data.serverUrl || DEFAULT_SERVER_URL;
  const email = data.employeeEmail.toLowerCase();
  const now = Date.now();

  if (newState === 'idle' || newState === 'locked') {
    // Idle stretch started
    chrome.storage.local.set({ idleStartTimestamp: now });
  } else if (newState === 'active') {
    // Idle stretch ended — calculate completed interval
    const idleStart = data.idleStartTimestamp;
    chrome.storage.local.set({ idleStartTimestamp: null, autoAbsentFired: false });

    if (idleStart) {
      const durationSeconds = Math.floor((now - idleStart) / 1000);
      // Log idle entry if >= 3 minutes
      if (durationSeconds >= INACTIVITY_REPORT_SECONDS) {
        await uploadInactivityLog(serverUrl, email, new Date(idleStart).toISOString(), new Date(now).toISOString(), durationSeconds);
      }
    }
  }
});

// Upload completed inactivity interval to hr_inactivity_logs
async function uploadInactivityLog(serverUrl, email, startIso, endIso, durationSeconds) {
  try {
    await fetch(`${serverUrl}/api/collections/hr_inactivity_logs/records`, {
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

// ── Screen Capture Tick ───────────────────────────────────────────────────
async function handleScreenshotTick() {
  const data = await getStorageData();
  if (!data.shiftActive || !data.employeeEmail) return;

  const serverUrl = data.serverUrl || DEFAULT_SERVER_URL;
  const email = data.employeeEmail.toLowerCase();

  try {
    // Capture current active tab image
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 60 }, async (dataUrl) => {
      if (!dataUrl || chrome.runtime.lastError) return;

      // Upload base64 image data to hr_screenshots
      const body = {
        employee_email: email,
        image_data: dataUrl,
        timestamp: new Date().toISOString(),
        device_label: 'Chromebook / Chrome OS'
      };

      await fetch(`${serverUrl}/api/collections/hr_screenshots/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      console.log('[Delcargo Tracker] Screenshot captured & uploaded.');
    });
  } catch (e) {
    console.error('[Delcargo Tracker] Screenshot tick failed:', e);
  }
}

// ── Message Listener from Popup UI ────────────────────────────────────────
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === 'START_SHIFT') {
    const nowIso = new Date().toISOString();
    chrome.storage.local.set({
      shiftActive: true,
      shiftStartTime: nowIso,
      employeeEmail: req.email,
      serverUrl: req.serverUrl || DEFAULT_SERVER_URL,
      autoAbsentFired: false,
      idleStartTimestamp: null
    }, () => {
      handleHeartbeatTick();
      sendResponse({ success: true });
    });
    return true;
  }

  if (req.type === 'STOP_SHIFT') {
    getStorageData().then(async (data) => {
      const serverUrl = data.serverUrl || DEFAULT_SERVER_URL;
      const email = data.employeeEmail;
      await autoClockOut(serverUrl, email, 'manual_stop');
      sendResponse({ success: true });
    });
    return true;
  }
});
