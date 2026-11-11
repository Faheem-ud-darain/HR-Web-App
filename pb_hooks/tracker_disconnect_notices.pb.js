/// <reference path="../pb_data/types.d.ts" />

// Tells an employee, by push, the moment their tracker disconnects during a shift, and again when it
// reconnects. Every outage is one row in hr_tracker_disconnects (when it dropped, why, when it came
// back, how long it lasted).
//
// Runs every minute. An outage starts when the tracker has been silent for 4 minutes (it reports about
// every 3), or at once when the employee quit it on purpose (quit_intent). The disconnect time recorded
// is the LAST signal, not the moment we noticed. Only that employee is notified, and no amounts appear.
//
// Needs the collection hr_tracker_disconnects (admin route: /api/admin/schema-migration, action
// ensureTrackerDisconnects) and the category "tracker_alert" in push_notifications.pb.js.
//
// NOTE: PocketBase v0.22.x pre-v0.23 JS hooks API, same as the other files here. Everything the
// callback needs is declared INSIDE it (the JSVM does not share outer scope with cron callbacks).

cronAdd("tracker_disconnect_notices", "* * * * *", () => {
  const SILENT_MS = 4 * 60 * 1000; // no tracker signal for this long = disconnected
  const LIVE_MS = 4 * 60 * 1000; // a signal newer than this = connected again
  const CONNECTED_BEFORE_SHIFT_MS = 5 * 60 * 1000; // the tracker counts as running this shift if it reported up to this long before clock-in

  function parseMs(value) {
    return new Date(String(value || "").replace(" ", "T")).getTime();
  }

  function findRowByEmail(dao, collection, email) {
    const lower = String(email || "").toLowerCase();
    const rows = dao.findRecordsByFilter(collection, "email ~ {:email}", "", 20, 0, { email: lower });
    return rows.find((r) => String(r.get("email") || "").toLowerCase() === lower) || null;
  }

  function readSignal(row, field) {
    const raw = row ? row.getString(field) : "";
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (err) { return null; }
  }

  function formatDuration(ms) {
    const minutes = Math.max(0, Math.round(ms / 60000));
    return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  }

  // Why it dropped, from the last thing the tracker told us. Honest about guessing: with no
  // explicit signal the cause is unknown (asleep, offline, shut down or crashed look identical).
  function pickReason(hb, quit, lastSeenMs) {
    const quitMs = quit ? parseMs(quit.timestamp) : NaN;
    if (!isNaN(quitMs) && quitMs >= lastSeenMs - 60 * 1000) {
      return { code: "closed_by_user", text: "You closed the tracker app.", at: quitMs };
    }
    if (hb.isLocked) {
      return { code: "locked", text: "Your computer was locked or asleep when the last signal arrived.", at: lastSeenMs };
    }
    if (hb.captureEnabled === false || (hb.consecutiveCaptureFailures || 0) >= 3 || hb.lastCaptureError) {
      return { code: "capture_problem", text: "Screenshots were failing before the tracker went quiet (check Screen Recording permission).", at: lastSeenMs };
    }
    return { code: "no_signal", text: "No signal from your computer. It may be asleep, offline, shut down, or the tracker stopped.", at: lastSeenMs };
  }

  function addNotification(dao, email, message, pushTitle) {
    try {
      const record = new Record(dao.findCollectionByNameOrId("hr_notifications"));
      record.set("recipient_email", email);
      record.set("recipient_role", "employee");
      record.set("message", message);
      record.set("read", false);
      record.set("category", "tracker_alert");
      record.set("push_title", pushTitle);
      record.set("sender_email", "");
      record.set("link", "");
      record.set("timestamp", new Date().toISOString());
      dao.saveRecord(record);
    } catch (err) {
      console.log("[tracker_disconnect_notices] addNotification failed:", err);
    }
  }

  function checkTrackerConnections() {
    const dao = $app.dao();
    const now = Date.now();
    const shifts = dao.findRecordsByFilter("hr_timesheets", 'clock_out = ""', "", 500, 0, {});
    const openEmails = {};

    const trackingSettings = dao.findRecordsByFilter("hr_tracking_settings", "id != ''", "", 500, 0, {});
    const trackedEmails = {};
    trackingSettings.forEach((t) => {
      if (t.get("enabled")) trackedEmails[String(t.get("employeeEmail") || "").toLowerCase()] = true;
    });

    shifts.forEach((shift) => {
      try {
        const email = String(shift.get("employee_id") || "").toLowerCase();
        if (!email || !trackedEmails[email]) return; // not tracker-governed
        openEmails[email] = true;
        const clockInMs = parseMs(shift.get("clock_in"));
        if (isNaN(clockInMs)) return;

        const row = findRowByEmail(dao, "hr_tracker_signals", email);
        const hb = readSignal(row, "heartbeat");
        const lastSeenMs = hb ? parseMs(hb.lastSeenAt) : NaN;
        if (isNaN(lastSeenMs) || lastSeenMs < clockInMs - CONNECTED_BEFORE_SHIFT_MS) return; // never connected this shift — ambiguous, don't guess

        const open = dao.findRecordsByFilter("hr_tracker_disconnects", 'employee_id = {:e} && status = "open"', "", 5, 0, { e: email });
        const outage = open.length ? open[0] : null;
        const age = now - lastSeenMs;

        if (outage) {
          const droppedMs = parseMs(outage.get("disconnected_at"));
          if (age < LIVE_MS && lastSeenMs > droppedMs) {
            outage.set("status", "reconnected");
            outage.set("reconnected_at", new Date(lastSeenMs).toISOString());
            outage.set("duration", formatDuration(lastSeenMs - droppedMs));
            dao.saveRecord(outage);
            addNotification(dao, email, `Your tracker is connected again (it was off for ${formatDuration(lastSeenMs - droppedMs)}).`, "Tracker reconnected");
          }
          return;
        }

        const reason = pickReason(hb, readSignal(row, "quit_intent"), lastSeenMs);
        const closedOnPurpose = reason.code === "closed_by_user";
        if (age < SILENT_MS && !closedOnPurpose) return; // still reporting, and not quit on purpose

        const record = new Record(dao.findCollectionByNameOrId("hr_tracker_disconnects"));
        record.set("employee_id", email);
        record.set("shift_id", shift.getId());
        record.set("status", "open");
        record.set("disconnected_at", new Date(closedOnPurpose ? reason.at : lastSeenMs).toISOString());
        record.set("detected_at", new Date(now).toISOString());
        record.set("reason_code", reason.code);
        record.set("reason", reason.text);
        record.set("reconnected_at", "");
        record.set("duration", "");
        dao.saveRecord(record);
        addNotification(dao, email, `Your tracker disconnected. ${reason.text}`, "Tracker disconnected");
      } catch (err) {
        console.log("[tracker_disconnect_notices] shift check failed:", err);
      }
    });

    // The shift ended (or tracking was turned off) while an outage was open: close it without a push.
    try {
      dao.findRecordsByFilter("hr_tracker_disconnects", 'status = "open"', "", 500, 0, {}).forEach((outage) => {
        if (openEmails[String(outage.get("employee_id") || "").toLowerCase()]) return;
        outage.set("status", "shift_ended");
        dao.saveRecord(outage);
      });
    } catch (err) {
      console.log("[tracker_disconnect_notices] closing outages failed:", err);
    }
  }

  try {
    checkTrackerConnections();
  } catch (err) {
    console.log("[tracker_disconnect_notices] run failed:", err);
  }
});
