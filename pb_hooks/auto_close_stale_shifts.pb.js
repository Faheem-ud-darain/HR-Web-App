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
//
// 2026-09-07 FIX: this hook ran on schedule every 15 minutes from day one
// (confirmed via journalctl — the deploy pipeline and cronAdd registration
// both worked correctly) but threw "ReferenceError: autoCloseStaleShifts
// is not defined" on literally every single tick, meaning it never once
// actually closed a shift since being added. The cronAdd callback was
// calling a top-level `function autoCloseStaleShifts() {...}` declared
// later in this same file — that should hoist under normal JS semantics,
// but PocketBase's JSVM evidently does not preserve that cross-declaration
// closure for a scheduled cron callback. Fix: every helper function, every
// constant, and the main routine are now declared directly INSIDE the
// cronAdd callback itself, so nothing the callback needs depends on
// anything outside its own function body.

cronAdd("auto_close_stale_shifts", "*/15 * * * *", () => {
  const SHIFT_TAB_HEARTBEAT_STALE_MS = 15 * 60 * 1000; // matches SHIFT_TAB_HEARTBEAT_STALE_MS in hrData.ts
  const TRACKER_HEARTBEAT_LIVE_TOLERANCE_MS = 13 * 60 * 1000; // matches isHeartbeatLive's default (3 + 10 min) in hrData.ts
  const ORPHAN_SHIFT_GRACE_MS = 30 * 60 * 1000; // reverted to 30 min on 2026-09-07 — the 15-min value caused false auto-closes for employees who were still actively working (see MIN_SHIFT_AGE_MS note below)
  const MIN_SHIFT_AGE_MS = 45 * 60 * 1000; // reverted to 45 min on 2026-09-07 — at 25 min, Pass 2 (abandoned manual shifts) was becoming eligible to fire during completely normal, brief tracker/tab heartbeat gaps (laptop sleep, wifi blip), incorrectly closing shifts for employees who were still connected and working (confirmed via camila@delcargo.us: shift auto-closed at 16:00, tracker captured a screenshot at 16:04). 45 min gives enough margin above the 13-min tracker and 15-min tab heartbeat tolerances that a normal blip can't coincide with shift-age eligibility.
  const MAX_SHIFT_DURATION_MS = 16 * 60 * 60 * 1000; // matches autoCloseStaleOpenShifts in hrData.ts

  function formatDurationBetween(startISO, endISO) {
    const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
    const totalMinutes = Math.max(0, Math.round(ms / 60000));
    return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
  }

  // Dates come back either ISO ("2026-10-23T14:37:00.239Z") or PocketBase-style
  // ("2026-10-23 14:37:00.239Z"); normalise before parsing so both read the same.
  function parseMs(value) {
    return new Date(String(value || "").replace(" ", "T")).getTime();
  }

  // Case-insensitive row lookup by email in a real collection ("~" narrows, the exact
  // check confirms — same pattern as findProfileByEmail below). Returns null when the
  // row genuinely does not exist; a failed read THROWS, and every caller is inside a
  // per-shift try/catch, so an unreadable heartbeat means "skip this shift this run"
  // and never "treat the employee as gone".
  function findRowByEmail(dao, collection, email) {
    const lower = String(email || "").toLowerCase();
    const rows = dao.findRecordsByFilter(collection, "email ~ {:email}", "", 20, 0, { email: lower });
    return rows.find((r) => String(r.get("email") || "").toLowerCase() === lower) || null;
  }

  // The tracker's heartbeat lives in hr_tracker_signals.heartbeat (JSON) since plan 027.
  // This used to read the retired KV key tracker_heartbeat_<slug> in hr_delcargo_store,
  // which stopped being written in September, so every tracker looked dead.
  function getTrackerHeartbeat(dao, email) {
    const row = findRowByEmail(dao, "hr_tracker_signals", email);
    if (!row) return null; // never connected
    const raw = row.getString("heartbeat");
    return raw ? JSON.parse(raw) : null;
  }

  function isTrackerHeartbeatLive(hb) {
    if (!hb || !hb.lastSeenAt) return false;
    const lastSeenMs = parseMs(hb.lastSeenAt);
    return !isNaN(lastSeenMs) && (Date.now() - lastSeenMs) < TRACKER_HEARTBEAT_LIVE_TOLERANCE_MS;
  }

  // The portal tab's heartbeat lives in hr_shift_tab_heartbeats.last_seen_at (one row per
  // email) since plan 027 phase 5. This used to read the retired KV key
  // shift_tab_heartbeat_<slug>, which is why every manual shift of an employee WITHOUT
  // tracking looked abandoned and was closed ~50 minutes after it started.
  function isShiftTabHeartbeatLive(dao, email) {
    const row = findRowByEmail(dao, "hr_shift_tab_heartbeats", email);
    if (!row) return false; // never had a tab heartbeat
    const lastSeenMs = parseMs(row.getString("last_seen_at"));
    return !isNaN(lastSeenMs) && (Date.now() - lastSeenMs) < SHIFT_TAB_HEARTBEAT_STALE_MS;
  }

  function deleteTabHeartbeat(dao, email) {
    try {
      const row = findRowByEmail(dao, "hr_shift_tab_heartbeats", email);
      if (row) dao.deleteRecord(row);
    } catch (err) {
      // best-effort cleanup — nothing to do
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
    deleteTabHeartbeat(dao, shift.get("employee_id"));
  }

  function autoCloseStaleShifts() {
    const dao = $app.dao();
    const now = Date.now();

    // ── Pass 1: orphaned tracker-governed shifts (mirrors
    // autoCloseOrphanTrackedShifts) — tracking enabled, heartbeat dead 30+
    // minutes, shift older than 45 minutes so a first-heartbeat-not-posted-
    // yet shift isn't touched. Closes at the last real heartbeat, never "now".
    const trackingSettings = dao.findRecordsByFilter("hr_tracking_settings", "id != ''", "", 500, 0, {});
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

        const lastSeenMs = parseMs(hb.lastSeenAt);
        if (isNaN(lastSeenMs) || now - lastSeenMs < ORPHAN_SHIFT_GRACE_MS) return; // recent enough — genuinely active

        const closeAtIso = new Date(Math.max(lastSeenMs, clockInMs)).toISOString();
        closeShift(dao, shift, closeAtIso);

        // Only heartbeat on file predates the shift: 0 minutes credited, and
        // the message says so (mirrors autoCloseOrphanTrackedShifts in hrData).
        const noActivity = lastSeenMs <= clockInMs;
        const profile = findProfileByEmail(dao, email);
        const name = displayNameFor(profile, email);
        const employeeMsg = noActivity
          ? "Your shift was automatically ended with 0 minutes credited because the DelCargo Tracker reported no activity after you clocked in. If you were working, contact HR."
          : "Your shift was automatically ended because the DelCargo Tracker app stopped reporting in while your shift was still open. If this looks wrong, contact HR.";
        const staffMsg = noActivity
          ? `${name}'s shift was auto-closed with 0 minutes — the tracker reported no activity after clock-in. Review it if they report having worked.`
          : `${name}'s shift was auto-closed — their tracker stopped reporting in while the shift was still open.`;
        addNotification(dao, email, "employee", employeeMsg, "shift");
        addNotification(dao, "all", "hr", staffMsg, "shift", name, email);
        addNotification(dao, "all", "admin", staffMsg, undefined, undefined, email);
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

        // BUGFIX 2026-09-07: this pass used to run for every non-USA open
        // shift regardless of whether the employee has tracker-based
        // tracking enabled. For a tracked employee, the shift-tab (browser
        // tab) heartbeat is essentially never "live" — the whole point of
        // the desktop tracker is that it works with the tab closed — so
        // this pass fell straight through to its OWN tracker check, which
        // uses a much tighter tolerance (TRACKER_HEARTBEAT_LIVE_TOLERANCE_MS,
        // 13 min) than Pass 1's dedicated orphan check (ORPHAN_SHIFT_GRACE_MS,
        // 30 min). Any brief, completely normal heartbeat-ping gap over 13
        // min was enough to trip this pass and falsely close an actively
        // worked shift — confirmed via camila@delcargo.us, sofia@delcargo.us
        // and others repeatedly losing shifts while their tracker kept
        // reporting in throughout. Tracked employees are Pass 1's
        // responsibility entirely; skip them here.
        // Either switch counts: hr_tracking_settings.enabled (what the tracker obeys) or
        // hr_profiles.tracking_enabled (what the dashboard shows). The two can drift apart,
        // and one bad value must never turn a tracked employee into an "untracked" one whose
        // shift gets closed for a missing portal heartbeat.
        const settings = settingsByEmail[String(email).toLowerCase()];
        if (settings && settings.get("enabled")) return;
        if (profile.get("tracking_enabled")) return;

        if (isShiftTabHeartbeatLive(dao, email)) return;
        const hb = getTrackerHeartbeat(dao, email);
        if (isTrackerHeartbeatLive(hb)) return; // something else is still actively watching this shift

        const closeAtIso = new Date(now).toISOString(); // no better signal available — same as the client-side version, which also closes "now" here
        closeShift(dao, shift, closeAtIso);

        const name = displayNameFor(profile, email);
        addNotification(dao, email, "employee", "Your shift was automatically ended because the DelCargo portal (browser tab or mobile app) was closed or stopped responding for 15 minutes. If this looks wrong, contact HR.");
        addNotification(dao, "all", "hr", `${name}'s portal (browser tab or mobile app) was closed or stopped responding while on shift — the shift was ended automatically.`, "shift", name, email);
        addNotification(dao, "all", "admin", `${name}'s portal (browser tab or mobile app) was closed or stopped responding while on shift — the shift was ended automatically.`, undefined, undefined, email);
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
          const lastSeenMs = parseMs(hb.lastSeenAt);
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

  try {
    autoCloseStaleShifts();
  } catch (err) {
    console.log("[auto_close_stale_shifts] hook error:", err);
  }
});
