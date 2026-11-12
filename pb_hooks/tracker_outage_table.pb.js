/// <reference path="../pb_data/types.d.ts" />

// When PocketBase starts, create the collection hr_tracker_disconnects if it is missing (the outage history that
// tracker_disconnect_notices.pb.js writes), so no admin has to run a route first. Same fields the admin route
// /api/admin/schema-migration (action ensureTrackerDisconnects) would create; the rules stay null, so only the server
// and admins can read or write it.
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
    console.log("[tracker_outage_table] created collection hr_tracker_disconnects");
  } catch (err) {
    console.log("[tracker_outage_table] could not create hr_tracker_disconnects: " + err);
  }
});
