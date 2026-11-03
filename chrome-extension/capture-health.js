// Capture health for the Chromebook tracker: what the heartbeat tells HR about screenshots.
//
// The desktop agent reports lastCaptureAt / captureEnabled / lastCaptureError / consecutiveCaptureFailures in
// its heartbeat; the dashboard's "No screenshots for N min" alert (getCaptureGap in src/lib/core/timesheets.ts)
// only works for a tracker that reports them, and stays silent for one that does not. These are the pure
// pieces the extension uses to report them too, kept free of chrome.* so they can be tested (src/lib/chromeExtension.test.ts).
//
// Loaded by background.js with importScripts, and by the tests with require.

// What the heartbeat carries for the shape the dashboard reads (see TrackerHeartbeat in src/lib/hr/types.ts).
// `stored` is chrome.storage.local: shiftActive, lastUploadedAt (ms, set only once an upload is confirmed), lastCaptureError,
// captureFailures, and captureBlocked ('token' | 'disabled' | null: why capturing is not allowed right now).
// Note lastScreenshotTime is NOT used here: background.js sets it when a capture is *attempted*, to schedule the next one.
function buildHeartbeat({ email, deviceId, connectedAt, nowIso, version, stored }) {
  return {
    employeeEmail: email,
    deviceId,
    deviceLabel: 'Chromebook / Chrome OS',
    connectedAt,
    lastSeenAt: nowIso,
    agentVersion: version,
    lastCaptureAt: stored.lastUploadedAt ? new Date(stored.lastUploadedAt).toISOString() : null,
    // As on the desktop agent: should it be capturing right now (on shift, and not blocked by an old setup code or HR switching tracking off).
    captureEnabled: !!stored.shiftActive && !stored.captureBlocked,
    lastCaptureError: stored.lastCaptureError || null,
    consecutiveCaptureFailures: stored.captureFailures || 0,
  };
}

// The storage changes after one capture attempt: a success clears the error and the streak, a failure keeps the
// last confirmed upload and counts up with the reason, so HR sees why nothing is arriving.
function afterCapture(stored, outcome, nowMs) {
  if (outcome.ok) return { lastUploadedAt: nowMs, lastCaptureError: null, captureFailures: 0 };
  return { lastCaptureError: outcome.reason, captureFailures: (stored.captureFailures || 0) + 1 };
}

const CAPTURE_REASONS = {
  noFrame: 'Could not capture the screen: the screen share was stopped and no tab is visible.',
  noConnection: 'The screenshot was taken but could not be uploaded (no connection to the server).',
  // Same wording the dashboard looks for (STALE_TOKEN_ERROR_MARKER in src/lib/core/timesheets.ts), so it is diagnosed as an old setup code.
  staleToken: 'Setup token not recognized by the server. Ask HR for a new setup code and reconnect the tracker.',
  uploadRejected: (status) => `The screenshot was taken but the server refused it (HTTP ${status}).`,
};

if (typeof module !== 'undefined' && module.exports) module.exports = { buildHeartbeat, afterCapture, CAPTURE_REASONS };
else globalThis.CaptureHealth = { buildHeartbeat, afterCapture, CAPTURE_REASONS };
