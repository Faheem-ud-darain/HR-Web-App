/// <reference path="../pb_data/types.d.ts" />

// Tells the employee, by push, the moment their shift is ended automatically for 37 minutes of inactivity, and tells HR too.
//
// Both the desktop tracker and the Chromebook extension write a stop signal (shift_stop_signal on the employee's hr_tracker_signals
// row, reason "inactivity_absence") when they end a shift for it, so this is the one place that sends the notice, whichever app
// ended the shift. It sends nothing for other reasons, and no amount appears anywhere: the absence itself is made later, from the
// inactivity log, by the web app. The "tracker_alert" category always pushes (see push_notifications.pb.js).
//
// NOTE: PocketBase v0.22.x pre-v0.23 JS hooks API, same as the other files here. Everything the callback needs is declared INSIDE it.

onRecordAfterUpdateRequest((e) => {
  const FRESH_MS = 10 * 60 * 1000; // an older signal is history, not news

  function readSignal(record) {
    try { return JSON.parse(record.getString("shift_stop_signal") || ""); } catch (err) { return null; }
  }

  function addNotification(dao, to, role, message, pushTitle) {
    try {
      const record = new Record(dao.findCollectionByNameOrId("hr_notifications"));
      record.set("recipient_email", to);
      record.set("recipient_role", role);
      record.set("message", message);
      record.set("read", false);
      record.set("category", "tracker_alert");
      record.set("push_title", pushTitle);
      record.set("sender_email", "");
      record.set("link", "");
      record.set("timestamp", new Date().toISOString());
      dao.saveRecord(record);
    } catch (err) {
      console.log("[tracker_shift_ended_notice] addNotification failed:", err);
    }
  }

  try {
    const now = readSignal(e.record);
    const before = readSignal(e.record.originalCopy());
    if (!now || now.reason !== "inactivity_absence") return;
    if (before && before.timestamp === now.timestamp) return; // another field of the row changed (heartbeats do it constantly)
    const at = new Date(String(now.timestamp || "")).getTime();
    if (!isFinite(at) || Date.now() - at > FRESH_MS) return;

    const dao = $app.dao();
    const email = String(e.record.getString("email") || now.employeeEmail || "").toLowerCase();
    if (!email) return;
    let name = email;
    try {
      const profile = dao.findFirstRecordByFilter("hr_profiles", "email ~ {:email}", { email: email });
      name = profile.getString("full_name") || email;
    } catch (err) { /* no profile found: the email stands in for the name */ }

    addNotification(dao, email, "employee",
      "Your shift was ended automatically: there was no keyboard or mouse activity for 37 minutes. A stretch this long counts as an absence for today. If you think it is a mistake, contact HR.",
      "Shift ended");
    addNotification(dao, "all", "hr", name + "'s shift was ended automatically after 37 minutes with no keyboard or mouse activity.", "Shift ended: " + name);
  } catch (err) {
    console.log("[tracker_shift_ended_notice] failed:", err);
  }
}, "hr_tracker_signals");
