// Rules for giving time back to a shift that the SERVER ended automatically (the tracker went silent for 30+ minutes). The server closes such a
// shift at the tracker's last signal and marks it status "completed". Two things can show that time was really worked:
//   A. RESTART: the employee clocks in again soon after the automatic end -> the time between the tracker's last signal and the restart counts.
//   B. PROOF: screenshots the tracker took while it could not reach the server arrive later with their real capture time -> the shift is
//      extended step by step to the latest of them.
// This is a plain module (not a *.pb.js hook), loaded with require() by shift_credit.pb.js. The rules are pure so they can be tested.

const RESUME_WINDOW_MS = 10 * 60 * 1000; // a restart counts if it happens within this long of the automatic end
const MAX_RESUME_GAP_MS = 45 * 60 * 1000; // ...and the time it gives back (last signal to restart) is at most this long
const PROOF_STEP_MS = 20 * 60 * 1000; // a screenshot counts if taken within this long after the shift's current end (captures are about 15 min apart)
const SERVER_CLOSE_LAG_MS = 25 * 60 * 1000; // the server closes a shift only after 30+ minutes of silence, so its close time is this much later than the recorded end; a person clocking out is not
const MAX_SHIFT_MS = 12 * 60 * 60 * 1000; // and no credit can make a shift longer than this

// PocketBase writes dates as "2026-11-12 18:45:00.153Z"; the app writes "2026-11-12T18:45:00.153Z".
function parseMs(value) {
  return new Date(String(value || "").replace(" ", "T")).getTime();
}

function formatDuration(startIso, endIso) {
  const minutes = Math.max(0, Math.round((parseMs(endIso) - parseMs(startIso)) / 60000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// a = { status, clockOut, endedAt (when the server closed it), newClockIn, now }. Returns { clockOut, creditedMs } or null.
function resumeCredit(a) {
  if (a.status !== "completed") return null;
  const out = parseMs(a.clockOut), restart = parseMs(a.newClockIn), endedAt = parseMs(a.endedAt), now = a.now;
  if (![out, restart, endedAt, now].every(Number.isFinite)) return null;
  if (endedAt - out < SERVER_CLOSE_LAG_MS) return null; // the person clocked out themselves
  const gap = restart - out;
  if (gap < 0 || gap > MAX_RESUME_GAP_MS) return null;
  if (now - endedAt > RESUME_WINDOW_MS) return null;
  return { clockOut: new Date(restart).toISOString(), creditedMs: gap };
}

// a = { status, clockIn, clockOut, endedAt, capturedAt }. Returns { clockOut } (the new end of the shift) or null.
function proofCredit(a) {
  if (a.status !== "completed") return null;
  const start = parseMs(a.clockIn), out = parseMs(a.clockOut), shot = parseMs(a.capturedAt), endedAt = parseMs(a.endedAt);
  if (![start, out, shot, endedAt].every(Number.isFinite)) return null;
  if (endedAt - out < SERVER_CLOSE_LAG_MS) return null; // the person clocked out themselves
  if (shot <= out || shot - out > PROOF_STEP_MS || shot - start > MAX_SHIFT_MS) return null;
  return { clockOut: new Date(shot).toISOString() };
}

module.exports = { parseMs, formatDuration, resumeCredit, proofCredit, RESUME_WINDOW_MS, SERVER_CLOSE_LAG_MS, MAX_RESUME_GAP_MS, PROOF_STEP_MS, MAX_SHIFT_MS };
