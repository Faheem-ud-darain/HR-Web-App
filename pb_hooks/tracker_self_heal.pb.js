/// <reference path="../pb_data/types.d.ts" />

// Two server-side safety nets for the desktop tracker, so neither depends on an employee updating the app or on someone
// running an admin route:
//
// 1. When PocketBase starts, create the collection hr_tracker_disconnects if it is missing (the outage history that
//    tracker_disconnect_notices.pb.js writes). Same fields the admin route /api/admin/schema-migration (action
//    ensureTrackerDisconnects) would create; the rules stay null, so only the server and admins can read or write it.
//
// 2. When an inactivity absence exists but nothing in hr_inactivity_logs shows the idle stretch behind it, add that
//    stretch to the log. Older tracker versions ended the shift the moment the 37th minute passed and never reported
//    that last stretch, so HR saw an absence with no mouse-activity entry. It checks the last 10 days of absences every 2 minutes. Only absences the tracker made right when the stretch ended are filled: one
//    the web app made from a finished log always has that log already.
//
// NOTE: PocketBase v0.22.x pre-v0.23 JS hooks API, same as the other files here. Everything a callback needs is declared
// INSIDE it (the JSVM does not share outer scope with callbacks).

onAfterBootstrap(() => {
  const dao = $app.dao();
  try {
    dao.findCollectionByNameOrId("hr_tracker_disconnects");
    return;
  } catch (err) {
    // missing: create it below
  }
  try {
    const text = (name) => ({ name, type: "text", required: false, options: {} });
    const collection = new Collection({
      name: "hr_tracker_disconnects",
      type: "base",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      schema: ["employee_id", "shift_id", "status", "disconnected_at", "detected_at", "reason_code", "reason", "reconnected_at", "duration"].map(text),
      indexes: ["CREATE INDEX idx_hr_tracker_disconnects_emp_status ON hr_tracker_disconnects (employee_id, status)"],
    });
    dao.saveCollection(collection);
    console.log("[tracker_self_heal] created collection hr_tracker_disconnects");
  } catch (err) {
    console.log("[tracker_self_heal] could not create hr_tracker_disconnects: " + err);
  }
});

cronAdd("tracker_fill_idle_logs", "*/2 * * * *", () => {
  const dao = $app.dao();
  const DAYS = 10;
  function parseMs(value) {
    return new Date(String(value || "").replace(" ", "T")).getTime();
  }
  try {
    const since = new Date(Date.now() - DAYS * 24 * 3600000).toISOString().replace("T", " ");
    const records = dao.findRecordsByFilter("hr_absence_records", "reason = 'inactivity' && deleted != true && created >= {:since}", "-created", 200, 0, { since: since });
    records.forEach((record) => {
      const minutes = Number(record.get("inactivityMinutes")) || 0;
      const email = String(record.getString("employeeEmail") || "").toLowerCase();
      let endMs = parseMs(record.getString("createdAt"));
      if (!isFinite(endMs)) endMs = parseMs(record.getString("created"));
      if (!email || minutes <= 0 || !isFinite(endMs)) return;
      const logs = dao.findRecordsByFilter("hr_inactivity_logs", "employee_email ~ {:email}", "-start_at", 200, 0, { email: email });
      const covered = logs.some((l) => {
        if (String(l.getString("employee_email") || "").toLowerCase() !== email) return false;
        const lEnd = parseMs(l.getString("end_at"));
        const lSecs = Number(l.getString("duration_seconds")) || 0;
        // a log of about this length that ended up to a day before the absence was made: the web app's own source for it
        return lSecs >= minutes * 60 - 120 && lEnd <= endMs + 5 * 60000 && lEnd >= endMs - 24 * 3600000;
      });
      if (covered) return;
      const row = new Record(dao.findCollectionByNameOrId("hr_inactivity_logs"));
      row.set("employee_email", email);
      row.set("start_at", new Date(endMs - minutes * 60000).toISOString());
      row.set("end_at", new Date(endMs).toISOString());
      row.set("duration_seconds", String(minutes * 60));
      row.set("device_label", "added by the server");
      dao.saveRecord(row);
      console.log("[tracker_self_heal] added the missing idle log behind " + email + "'s absence");
    });
  } catch (err) {
    console.log("[tracker_self_heal] idle-log fill failed: " + err);
  }
});
