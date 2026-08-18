/// <reference path="../pb_data/types.d.ts" />

// Server-side safety net for open shifts left running unreasonably long.
// Added 2026-08-18 in direct response to a real report: an employee's
// shift ran for ~24 hours despite this app already having logic that's
// supposed to prevent that.
//
// Root cause (see PROJECT_HISTORY.md): this app has NO server-side cron
// anywhere — every periodic safety check (tracker-orphan cleanup, the
// 16-hour hard cap, absence checks, screenshot retention) was written as a
// client-triggered `useEffect` that only runs while a specific browser tab
// happens to be open:
//   - hrActions.autoCloseOrphanTrackedShifts / autoCloseStaleOpenShifts
//     (src/lib/hrData.ts) only run from hr/page.tsx's or admin/page.tsx's
//     mount effect — if no HR/Admin has either dashboard open overnight,
//     they never fire.
//   - hrActions.closeStaleManualShiftIfAbandoned only runs when the
//     EMPLOYEE reopens their own dashboard and finds an already-open
//     shift — if they close the portal and don't come back, nothing
//     checks it from their side either.
// So a shift closed via "close the tracker" or "close the portal" could
// sit open indefinitely (as seen: ~24h) until someone with the right tab
// open happened to trigger the client-side check — the 16-hour hard cap
// existed in code but had no reliable way to actually run.
//
// This hook moves the same three checks onto the PocketBase droplet
// itself via cronAdd, so they run on a fixed schedule regardless of
// whether anyone has any tab open at all. Logic is a deliberate mirror of
// the client-side functions in hrData.ts — same thresholds, same
// close-at-last-known-good-timestamp behavior (never "now", so an
// overnight gap isn't credited to/blamed on the shift) — just re-hosted
// here so it's not dependent on a browser tab.
//
// Order (same as hrData.ts): tracker-orphan pass -> manual-tab-abandoned
// pass -> 16-hour hard cap as the final catch-all for anything still open
// (including GPS/USA shifts, which have no heartbeat concept of their own
// and are only ever caught by this last pass).
//
// Runs every 15 minutes — frequent enough that "closed the tracker" or
// "closed the portal" now gets caught within roughly the same grace
// windows the client-side checks already used (30 min / 15 min), instead
// of only whenever a browser tab happened to notice.
//
// NOTE: written for PocketBase v0.22.x's pre-v0.23 JS hooks API (cronAdd,
// $app.dao(), new Record(collection) + dao.saveRecord(record)) — this
// droplet runs 0.22.14, same as push_notifications.pb.js /
// push_announcements.pb.js. If PocketBase is ever upgraded past v0.23,
// check https://pocketbase.io/v023upgrade/jsvm/ for the new equivalents
// before assuming this still works as-is.

const SHIFT_TAB_HEARTBEAT_STALE_MS = 15 * 60 * 1000; // matches SHIFT_TAB_HEARTBEAT_STALE_MS in hrData.ts
const TRACKER_HEARTBEAT_LIVE_TOLERANCE_MS = 13 * 60 * 1000; // matches isHeartbeatLive's default (3 + 10 min) in hrData.ts
const ORPHAN_SHIFT_GRACE_MS = 30 * 60 * 1000; // matches autoCloseOrphanTrackedShifts in hrData.ts
const MIN_SHIFT_AGE_MS = 45 * 60 * 1000; // matches autoCloseOrphanTrackedShifts in hrData.ts
const MAX_SHIFT_DURATION_MS = 16 * 60 * 60 * 1000; // matches autoCloseStaleOpenShifts in hrData.ts

cronAdd("auto_close_stale_shifts", "*/15 * * * *", () => {
  try {
    autoCloseStaleShifts();
  } catch (err) {
    console.log("[auto_close_stale_shifts] hook error:", err);
  }
});

function slugify(email) {
  return String(email || "").toLowerCase().replace(/[^a-z0-9]/g, "_");
}

function formatDurationBetween(startISO, endISO) {
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

// Mirrors pbGetKV('tracker_heartbeat_<slug>') in hrData.ts.
function getTrackerHeartbeat(dao, email) {
  try {
    const row = dao.findFirstRecordByData("hr_delcargo_store", "key", `tracker_heartbeat_${slugify(email)}`);
    const raw = row.get("value");
    return raw && typeof raw === "object" ? raw : JSON.parse(raw || "null");
  } catch (err) {
    return null; // no row yet — never connected
  }
}

function isTrackerHeartbeatLive(hb) {
  if (!hb || !hb.lastSeenAt) return false;
  const lastSeenMs = new Date(hb.lastSeenAt).getTime();
  return !isNaN(lastSeenMs) && (Date.now() - lastSeenMs) < TRACKER_HEARTBEAT_LIVE_TOLERANCE_MS;
}

// Mirrors pbGetKV('shift_tab_heartbeat_<slug>') / isShiftTabHeartbeatLive.
function isShiftTabHeartbeatLive(dao, email) {
  try {
    const row = dao.findFirstRecordByData("hr_delcargo_store", "key", `shift_tab_heartbeat_${slugify(email)}`);
    const raw = row.get("value");
    const hb = raw && typeof raw === "object" ? raw : JSON.parse(raw || "null");
    if (!hb || !hb.lastSeenAt) return false;
    const lastSeenMs = new Date(hb.lastSeenAt).getTime();
    return !isNaN(lastSeenMs) && (Date.now() - lastSeenMs) < SHIFT_TAB_HEARTBEAT_STALE_MS;
  } catch (err) {
    return false; // no row — never had a manual shift tab heartbeat at all
  }
}

function deleteKvByKey(dao, key) {
  try {
    dao.deleteRecord(dao.findFirstRecordByData("hr_delcargo_store", "key", key));
  } catch (err) {
    // no such row — nothing to clean up
  }
}

// Case-insensitive email match, same "~ narrows, exact check confirms"
// pattern used throughout hrData.ts/pbAdmin.ts, so a differently-cased
// stored email or a substring false-match can't slip through.
function findProfileByEmail(dao, email) {
  try {
    const lower = String(email || "").toLowerCase();
    const candidates = dao.findRecordsByFilter("hr_profiles", "email ~ {:email}", "", 20, 0, { email: lower });
    return candidates.find((p) => String(p.get("email") || "").toLowerCase() === lower) || null;
  } catch (err) {
    return null;
  }
}

// Simplified vs. hrData.ts's real displayName(): that version also appends
// an `alias`, but alias lives in the hr_profile_extra_<id> KV overlay, not
// a real hr_profiles column — not worth an extra KV lookup per notification
// just for a cosmetic parenthetical. Full name alone is enough to identify
// who a notification is about.
function displayNameFor(profile, fallbackEmail) {
  const fullName = profile && profile.get("full_name");
  return fullName || fallbackEmail;
}

function addNotification(dao, email, role, message, category, pushTitle, senderEmail) {
  try {
    const collection = dao.findCollectionByNameOrId("hr_notifications");
    const record = new Record(collection);
    record.set("recipient_email", email);
    record.set("recipient_role", role);
    record.set("message", message);
    record.set("read", false);
    record.set("category", category || "internal");
    record.set("push_title", pushTitle || "");
    record.set("sender_email", senderEmail || "");
    record.set("link", "");
    // hrData.ts's addNotification writes formatTimeNY(new Date()) here (a
    // human-readable NY-local string) — not reproducible from this JS
    // sandbox without porting the whole timezone helper. A plain ISO
    // string is close enough for this field: every notification consumer
    // in the app already prefers PocketBase's own `created` system field
    // for display/sorting (see PROJECT_HISTORY.md's note on this exact
    // point), so this field is a secondary/cosmetic value, not load-bearing.
    record.set("timestamp", new Date().toISOString());
    dao.saveRecord(record);
  } catch (err) {
    console.log("[auto_close_stale_shifts] addNotification failed:", err);
  }
}

function closeShift(dao, shift, closeAtIso) {
  const clockIn = shift.get("clock_in");
  shift.set("clock_out", closeAtIso);
  shift.set("duration", formatDurationBetween(clockIn, closeAtIso));
  shift.set("status", "completed");
  dao.saveRecord(shift);
  deleteKvByKey(dao, `shift_tab_heartbeat_${slugify(shift.get("employee_id"))}`);
}

function autoCloseStaleShifts() {
  const dao = $app.dao();
  const now = Date.now();

  // ── Pass 1: orphaned tracker-governed shifts (mirrors
  // autoCloseOrphanTrackedShifts) — tracking enabled, heartbeat dead 30+
  // minutes, shift older than 45 minutes so a first-heartbeat-not-posted-
  // yet shift isn't touched. Closes at the last real heartbeat, never "now".
  const trackingSettings = dao.findRecordsByFilter("hr_tracking_settings", "", "", 500, 0, {});
  const settingsByEmail = {};
  trackingSettings.forEach((t) => {
    settingsByEmail[String(t.get("employeeEmail") || "").toLowerCase()] = t;
  });

  dao.findRecordsByFilter("hr_timesheets", 'clock_out = ""', "", 500, 0, {}).forEach((shift) => {
    try {
      const email = shift.get("employee_id"); // field is named employee_id but holds the email — see toTimesheet in hrData.ts
      const clockIn = shift.get("clock_in");
      const clockInMs = new Date(clockIn).getTime();
      if (isNaN(clockInMs) || now - clockInMs < MIN_SHIFT_AGE_MS) return;

      const settings = settingsByEmail[String(email).toLowerCase()];
      if (!settings || !settings.get("enabled")) return; // not tracker-governed — leave to later passes

      const hb = getTrackerHeartbeat(dao, email);
      if (!hb || !hb.lastSeenAt) return; // never connected at all — ambiguous, don't guess

      const lastSeenMs = new Date(hb.lastSeenAt).getTime();
      if (isNaN(lastSeenMs) || now - lastSeenMs < ORPHAN_SHIFT_GRACE_MS) return; // recent enough — genuinely active

      const closeAtIso = new Date(Math.max(lastSeenMs, clockInMs)).toISOString();
      closeShift(dao, shift, closeAtIso);

      const profile = findProfileByEmail(dao, email);
      const name = displayNameFor(profile, email);
      addNotification(dao, email, "employee",
        "Your shift was automatically ended because the DelCargo Tracker app stopped reporting in while your shift was still open. If this looks wrong, contact HR.",
        "shift");
      addNotification(dao, "all", "hr", `${name}'s shift was auto-closed — their tracker stopped reporting in while the shift was still open.`, "shift", name, email);
      addNotification(dao, "all", "admin", `${name}'s shift was auto-closed — their tracker stopped reporting in while the shift was still open.`, undefined, undefined, email);
    } catch (err) {
      console.log("[auto_close_stale_shifts] pass1 error for shift", shift.id, err);
    }
  });

  // ── Pass 2: abandoned manual shifts (mirrors closeStaleManualShiftIfAbandoned)
  // — non-USA/manual-shift employees only (USA is GPS-geofenced and has no
  // tab-heartbeat concept). If the portal tab hasn't heartbeated in 15
  // minutes AND the tracker (if any) isn't live either, nothing is actually
  // watching this shift anymore — treat it as abandoned.
  dao.findRecordsByFilter("hr_timesheets", 'clock_out = ""', "", 500, 0, {}).forEach((shift) => {
    try {
      const email = shift.get("employee_id");
      const clockIn = shift.get("clock_in");
      const clockInMs = new Date(clockIn).getTime();
      if (isNaN(clockInMs) || now - clockInMs < MIN_SHIFT_AGE_MS) return;

      const profile = findProfileByEmail(dao, email);
      if (!profile || profile.get("region") === "USA") return; // GPS-governed — no tab heartbeat to check

      if (isShiftTabHeartbeatLive(dao, email)) return;
      const hb = getTrackerHeartbeat(dao, email);
      if (isTrackerHeartbeatLive(hb)) return; // something else is still actively watching this shift

      const closeAtIso = new Date(now).toISOString(); // no better signal available — same as the client-side version, which also closes "now" here
      closeShift(dao, shift, closeAtIso);

      const name = displayNameFor(profile, email);
      addNotification(dao, email, "employee", "Your shift was automatically ended because the app was closed.");
      addNotification(dao, "all", "hr", `${name} closed the app while on shift — their shift was ended automatically.`, "shift", name, email);
      addNotification(dao, "all", "admin", `${name} closed the app while on shift — their shift was ended automatically.`, undefined, undefined, email);
    } catch (err) {
      console.log("[auto_close_stale_shifts] pass2 error for shift", shift.id, err);
    }
  });

  // ── Pass 3: hard cap (mirrors autoCloseStaleOpenShifts) — final catch-all
  // for ANY shift still open past 16 hours, regardless of category. This is
  // what actually catches GPS/USA shifts (no heartbeat concept of their own)
  // and anything passes 1/2 didn't have enough signal to close earlier.
  const capHours = Math.round(MAX_SHIFT_DURATION_MS / 3600000);
  dao.findRecordsByFilter("hr_timesheets", 'clock_out = ""', "", 500, 0, {}).forEach((shift) => {
    try {
      const email = shift.get("employee_id");
      const clockIn = shift.get("clock_in");
      const clockInMs = new Date(clockIn).getTime();
      if (isNaN(clockInMs) || now - clockInMs < MAX_SHIFT_DURATION_MS) return;

      let closeAtMs = clockInMs + MAX_SHIFT_DURATION_MS;
      const hb = getTrackerHeartbeat(dao, email);
      if (hb && hb.lastSeenAt) {
        const lastSeenMs = new Date(hb.lastSeenAt).getTime();
        if (!isNaN(lastSeenMs) && lastSeenMs > clockInMs && lastSeenMs < closeAtMs) closeAtMs = lastSeenMs;
      }
      const closeAtIso = new Date(closeAtMs).toISOString();
      closeShift(dao, shift, closeAtIso);

      const profile = findProfileByEmail(dao, email);
      const name = displayNameFor(profile, email);
      const dateLabel = String(clockIn).slice(0, 10);
      addNotification(dao, email, "employee",
        `Your shift starting ${dateLabel} was still open after ${capHours}+ hours and has been automatically ended. If this looks wrong, contact HR.`,
        "shift");
      addNotification(dao, "all", "hr", `${name}'s shift from ${dateLabel} was still open after ${capHours}+ hours and was auto-closed.`, "shift", name, email);
      addNotification(dao, "all", "admin", `${name}'s shift from ${dateLabel} was still open after ${capHours}+ hours and was auto-closed.`, undefined, undefined, email);
    } catch (err) {
      console.log("[auto_close_stale_shifts] pass3 error for shift", shift.id, err);
    }
  });
}
