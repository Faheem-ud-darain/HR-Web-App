/// <reference path="../pb_data/types.d.ts" />

// Containment, step 1 of plans/031-lock-down-pocketbase.md.
//
// Today the browser reads PocketBase directly with no PocketBase login, so the collections' list/view rules are
// public. That makes hr_profiles.password (the stored pbkdf2 hash) readable by anyone on the internet. Nothing in the
// browser ever needs that column (the roster the app shows comes from /api/roster, which already leaves it out), so
// this hook removes it from every response that is not made by a PocketBase superuser. The Next.js server routes
// authenticate as a superuser (src/lib/pbAdmin.ts), so they are unaffected.
//
// NOTE: written for PocketBase v0.22.x's pre-v0.23 JS hooks API (this droplet runs 0.22.14), like the other hooks
// here. NOT yet run against the droplet: deploy it to a copy first, then check that
//   curl 'https://<host>/api/collections/hr_profiles/records?perPage=1'
// no longer contains "password", and that sign-in, the roster and the profile pages still work.
//
// Add a field here only after checking that no browser code reads it (grep src/ for the column name). Bank and salary
// columns and hr_tracking_settings.agentToken are still read by the HR screens today, so they are NOT hidden by this
// file; they move behind server routes in step 3 of the plan.

const HIDDEN_FOR_PUBLIC = {
  hr_profiles: ["password"],
};

function hideFields(collectionName, record) {
  const fields = HIDDEN_FOR_PUBLIC[collectionName];
  if (fields && fields.length) record.hide(...fields);
}

onRecordsListRequest((e) => {
  if (e.httpContext.get("admin")) return; // PocketBase superuser (the server routes)
  for (const record of e.records) hideFields(e.collection.name, record);
}, "hr_profiles");

onRecordViewRequest((e) => {
  if (e.httpContext.get("admin")) return;
  hideFields(e.collection.name, e.record);
}, "hr_profiles");

// Not covered here: realtime. Anyone can subscribe to hr_profiles and receive a record's JSON, password included, when it
// changes. The app itself does not subscribe to hr_profiles, so nothing breaks by closing that, but it needs the
// collection's rules tightened (step 4 of the plan), because the 0.22 realtime hook hands over raw bytes that cannot be
// edited safely without testing on a real instance.
