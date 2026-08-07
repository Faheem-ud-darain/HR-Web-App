// Delcargo HR Tracker — Background Service Worker (Manifest V3)
// Automatic active shift detection, idle tracking, heartbeats, screen captures,
// and 37-minute continuous idle auto clock-out on ChromeOS & Chrome browser.

const DEFAULT_SERVER_URL = 'https://pb.delcargo.us';
const INACTIVITY_REPORT_SECONDS = 180; // 3 minutes — loggable idle threshold
const AUTO_ABSENT_INACTIVITY_SECONDS = 37 * 60; // 37 minutes — continuous idle auto clock-out
const SCREENSHOT_INTERVAL_MINUTES = 10;

// Helper to format heartbeat KV key matching web portal's getTrackerHeartbeat(email)
function getHeartbeatKey(email) {
  return 'tracker_heartbeat_' + (email || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
}

// Setup alarms & idle detection on extension load/install
chrome.runtime.onInstalled.addListener(() => {
  chrome.idle.setDetectionInterval(180); // 3 minutes
  chrome.alarms.create('tracker_heartbeat', { periodInMinutes: 0.25 }); // every 15 sec (0.25 min)
  chrome.alarms.create('tracker_screenshot', { periodInMinutes: SCREENSHOT_INTERVAL_MINUTES });
  console.log('[Delcargo Tracker] Extension installed & alarms initialized.');
  handleHeartbeatTick();
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
        'agentToken',
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
    const cleanUrl = (serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
    const listRes = await fetch(`${cleanUrl}/api/collections/hr_delcargo_store/records?filter=${encodeURIComponent(`key="${key}"`)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    const listData = await listRes.json();
    const existingRecord = listData?.items?.[0];

    const body = JSON.stringify({ key, value });
    if (existingRecord?.id) {
      await fetch(`${cleanUrl}/api/collections/hr_delcargo_store/records/${existingRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body
      });
    } else {
      await fetch(`${cleanUrl}/api/collections/hr_delcargo_store/records`, {
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
    const cleanUrl = (serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
    const listRes = await fetch(`${cleanUrl}/api/collections/hr_delcargo_store/records?filter=${encodeURIComponent(`key="${key}"`)}`, {
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

// ── Automatic Active Shift Checker (Matches desktop agent check_active_shift) ─
async function checkActiveShift(serverUrl, email) {
  try {
    const cleanUrl = (serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/api/collections/hr_timesheets/records?filter=${encodeURIComponent('clock_out=""')}&perPage=200`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const items = data?.items || [];
    const wanted = email.toLowerCase();

    // Match employee_id (stores employeeEmail)
    const openRecord = items.find(it => (it.employee_id || '').toLowerCase() === wanted);
    return openRecord || null;
  } catch (e) {
    console.error('[Delcargo Tracker] checkActiveShift failed:', e);
    return null;
  }
}

// ── Heartbeat & Shift Tick Handler ─────────────────────────────────────────
async function handleHeartbeatTick() {
  const data = await getStorageData();
  if (!data.employeeEmail) return;

  const serverUrl = (data.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
  const email = data.employeeEmail.toLowerCase();
  const nowIso = new Date().toISOString();
  const heartbeatKey = getHeartbeatKey(email);
  const deviceId = 'chromebook_' + email.replace(/[^a-z0-9]/g, '_');

  // 1. Upload live tracker heartbeat to PocketBase (read by Web Portal hrActions.getTrackerHeartbeat)
  try {
    const existingHb = await pbGetKV(serverUrl, heartbeatKey);
    const connectedAt = existingHb?.connectedAt || nowIso;

    const hbValue = {
      employeeEmail: email,
      deviceId: deviceId,
      deviceLabel: 'Chromebook / Chrome OS',
      connectedAt: connectedAt,
      lastSeenAt: nowIso,
      agentVersion: '6'
    };

    await pbSetKV(serverUrl, heartbeatKey, hbValue);
  } catch (e) {
    console.error('[Delcargo Tracker] Heartbeat upload failed:', e);
  }

  // 2. Query real shift status on PocketBase (matches desktop tracker)
  const openShiftRecord = await checkActiveShift(serverUrl, email);
  const isShiftOpen = !!openShiftRecord;

  if (isShiftOpen) {
    const clockInIso = openShiftRecord.clock_in || nowIso;
    chrome.storage.local.set({
      shiftActive: true,
      shiftStartTime: clockInIso
    });

    // 3. Live continuous 37+ minutes idle check
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
    // Shift is paused / not open on Web Portal
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

    // 3. If inactivity absence, record real-time absence entry
    if (reason === 'inactivity_absence') {
      const pktTodayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
      const recordId = `${email.toLowerCase()}_${pktTodayStr}`;
      const inactivityMinutes = Math.round(idleSeconds / 60);

      const existingAbsences = (await pbGetKV(cleanUrl, 'hr_absence_records_v1')) || [];
      if (!existingAbsences.some(r => r.id === recordId)) {
        existingAbsences.push({
          id: recordId,
          employeeEmail: email,
          employeeName: email,
          date: pktTodayStr,
          reason: 'inactivity',
          inactivityMinutes,
          deductionAmount: 0,
          createdAt: new Date().toISOString(),
          acknowledged: false
        });
        await pbSetKV(cleanUrl, 'hr_absence_records_v1', existingAbsences);
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

  const serverUrl = (data.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
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

// ── Screen Capture Tick ───────────────────────────────────────────────────
async function handleScreenshotTick() {
  const data = await getStorageData();
  if (!data.shiftActive || !data.employeeEmail) return;

  const serverUrl = (data.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
  const email = data.employeeEmail.toLowerCase();

  try {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 60 }, async (dataUrl) => {
      if (!dataUrl || chrome.runtime.lastError) return;

      const body = {
        employee_email: email,
        image_data: dataUrl,
        timestamp: new Date().toISOString(),
        device_label: 'Chromebook / Chrome OS'
      };

      await fetch(`${cleanUrl}/api/collections/hr_screenshots/records`, {
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
