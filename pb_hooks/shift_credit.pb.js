/// <reference path="../pb_data/types.d.ts" />

// Gives time back to a shift the server ended automatically because the tracker went silent. The rules are in shift_credit.js.
//   A. A new shift starts soon after an automatic end: the time between the tracker's last signal and the restart is counted (the earlier
//      shift is extended to the restart), and the employee, HR and Admin are told how many minutes.
//   B. A screenshot arrives whose capture time is just after an automatically ended shift's end: the shift is extended to it. The tracker
//      queues screenshots while it cannot reach the server and sends them, oldest first, when it can.
//
// NOTE: PocketBase v0.22.x pre-v0.23 JS hooks API, same as the other files here. Everything a callback needs is declared INSIDE it or loaded
// with require() (the JSVM does not share outer scope with callbacks).

onRecordAfterCreateRequest((e) => {
  try {
    const credit = require(`${__hooks}/shift_credit.js`);
    const dao = $app.dao();
    const fresh = e.record;
    const email = String(fresh.getString("employee_id") || "").toLowerCase();
    if (!email || fresh.getString("clock_out")) return; // only a shift that has just been opened

    const earlier = dao.findRecordsByFilter("hr_timesheets", "employee_id ~ {:e} && clock_in < {:t}", "-clock_in", 5, 0, { e: email, t: fresh.getString("clock_in") })
      .filter((s) => String(s.getString("employee_id")).toLowerCase() === email);
    const prev = earlier[0];
    if (!prev || !prev.getString("clock_out")) return;

    const decision = credit.resumeCredit({
      status: prev.getString("status"), clockOut: prev.getString("clock_out"), endedAt: prev.getString("updated"),
      newClockIn: fresh.getString("clock_in"), now: Date.now(),
    });
    if (!decision) return;

    prev.set("clock_out", decision.clockOut);
    prev.set("duration", credit.formatDuration(prev.getString("clock_in"), decision.clockOut));
    dao.saveRecord(prev);

    let name = email;
    try { name = dao.findFirstRecordByFilter("hr_profiles", "email ~ {:e}", { e: email }).getString("full_name") || email; } catch (err) { /* the email stands in */ }
    const minutes = Math.round(decision.creditedMs / 60000);
    const notify = (to, role, message, category) => {
      try {
        const n = new Record(dao.findCollectionByNameOrId("hr_notifications"));
        n.set("recipient_email", to); n.set("recipient_role", role); n.set("message", message); n.set("read", false);
        n.set("category", category || "internal"); n.set("push_title", ""); n.set("sender_email", ""); n.set("link", "");
        n.set("timestamp", new Date().toISOString());
        dao.saveRecord(n);
      } catch (err) { console.log("[shift_credit] notice failed:", err); }
    };
    notify(email, "employee", `You started a new shift right after your last one ended automatically, so the ${minutes} minutes in between were counted as worked.`, "shift");
    const staff = `${name} restarted their shift soon after it ended automatically, so the ${minutes} minutes between the tracker's last signal and the restart were counted.`;
    notify("all", "hr", staff, "shift");
    notify("all", "admin", staff);
  } catch (err) {
    console.log("[shift_credit] restart credit failed:", err);
  }
}, "hr_timesheets");

onRecordAfterCreateRequest((e) => {
  try {
    const credit = require(`${__hooks}/shift_credit.js`);
    const dao = $app.dao();
    const email = String(e.record.getString("employee_email") || "").toLowerCase();
    if (!email) return;
    const shifts = dao.findRecordsByFilter("hr_timesheets", "employee_id ~ {:e}", "-clock_in", 5, 0, { e: email })
      .filter((s) => String(s.getString("employee_id")).toLowerCase() === email);
    const latest = shifts[0]; // only the person's latest shift can be extended, and only once it is closed
    if (!latest || !latest.getString("clock_out")) return;

    const decision = credit.proofCredit({
      status: latest.getString("status"), clockIn: latest.getString("clock_in"), clockOut: latest.getString("clock_out"),
      endedAt: latest.getString("updated"), capturedAt: e.record.getString("captured_at"),
    });
    if (!decision) return;
    latest.set("clock_out", decision.clockOut);
    latest.set("duration", credit.formatDuration(latest.getString("clock_in"), decision.clockOut));
    dao.saveRecord(latest);
  } catch (err) {
    console.log("[shift_credit] screenshot credit failed:", err);
  }
}, "hr_screenshots");
