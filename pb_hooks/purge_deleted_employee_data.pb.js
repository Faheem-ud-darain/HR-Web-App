/// <reference path="../pb_data/types.d.ts" />

// Keeps a deleted employee's leftovers from lingering (absence records with their deductions, idle logs, heartbeats, sessions,
// tracking settings). Two parts:
//  1. The moment an hr_profiles row is deleted, everything keyed by that email is deleted with it, whoever deleted it and however.
//  2. A nightly sweep removes the same kinds of rows whose email has no profile any more (what earlier deletions left behind).
//     It does nothing unless the profile list reads back normally, so a failed read can never look like "everybody was deleted".
// Timesheets, payroll, leaves and the permanent communication trail are NOT touched here.
//
// NOTE: PocketBase v0.22.x pre-v0.23 JS hooks API, same as the other files here. Constants and helpers are declared inside each
// callback because the JSVM does not share outer scope with them.

onRecordAfterDeleteRequest((e) => {
  const TABLES = [
    ["hr_absence_records", "employeeEmail"], ["hr_inactivity_logs", "employee_email"], ["hr_shift_tab_heartbeats", "email"],
    ["hr_tracker_signals", "email"], ["hr_user_sessions", "email"], ["hr_activity_seen", "email"],
    ["hr_tracking_settings", "employeeEmail"], ["hr_tracker_disconnects", "employee_id"],
  ];
  const email = String(e.record.get("email") || "").toLowerCase();
  if (!email) return;
  const dao = $app.dao();
  TABLES.forEach((t) => {
    try {
      dao.findRecordsByFilter(t[0], t[1] + " ~ {:e}", "", 5000, 0, { e: email }).forEach((r) => {
        if (String(r.get(t[1]) || "").toLowerCase() === email) dao.deleteRecord(r);
      });
    } catch (err) {
      console.log("[purge_deleted_employee_data] could not clear", t[0], "for a deleted profile:", err);
    }
  });
}, "hr_profiles");

cronAdd("purge_deleted_employee_data", "40 3 * * *", () => {
  const TABLES = [
    ["hr_absence_records", "employeeEmail"], ["hr_inactivity_logs", "employee_email"], ["hr_shift_tab_heartbeats", "email"],
    ["hr_tracker_signals", "email"], ["hr_user_sessions", "email"], ["hr_activity_seen", "email"],
    ["hr_tracking_settings", "employeeEmail"], ["hr_tracker_disconnects", "employee_id"],
  ];
  const MIN_PROFILES = 3; // fewer than this means the read is not trustworthy: do nothing
  const PAGE = 500;
  const dao = $app.dao();
  const known = {};
  let count = 0;
  try {
    dao.findRecordsByFilter("hr_profiles", "id != ''", "", 5000, 0, {}).forEach((p) => {
      const email = String(p.get("email") || "").toLowerCase();
      if (email) { known[email] = true; count++; }
    });
  } catch (err) {
    console.log("[purge_deleted_employee_data] profiles unreadable, sweep skipped:", err);
    return;
  }
  if (count < MIN_PROFILES) {
    console.log("[purge_deleted_employee_data] only", count, "profiles read, sweep skipped");
    return;
  }
  TABLES.forEach((t) => {
    try {
      let removed = 0;
      let offset = 0;
      while (offset < 50000) {
        const rows = dao.findRecordsByFilter(t[0], 'id != ""', "-created", PAGE, offset, {});
        if (!rows.length) break;
        let pageRemoved = 0;
        rows.forEach((r) => {
          const email = String(r.get(t[1]) || "").toLowerCase();
          if (email && !known[email]) { dao.deleteRecord(r); pageRemoved++; }
        });
        removed += pageRemoved;
        if (rows.length < PAGE) break;
        offset += PAGE - pageRemoved; // deleted rows shift the later pages up
      }
      if (removed) console.log("[purge_deleted_employee_data]", t[0], "removed", removed, "rows of deleted employees");
    } catch (err) {
      console.log("[purge_deleted_employee_data] sweep failed for", t[0], ":", err);
    }
  });
});
