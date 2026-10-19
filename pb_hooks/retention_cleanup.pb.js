/// <reference path="../pb_data/types.d.ts" />

// Nightly retention clean-up: keeps the tables that grow forever from growing
// forever. Every query in the app runs against these tables, so a smaller table
// means faster indexes, faster backups and less work for a small droplet.
//
//   hr_notifications     delete rows older than 60 days  (20,000+ rows today; every
//                        open tab polls this table every 30s). 60 rather than 90
//                        because only ~3% of the table is older than 90 days — most of
//                        it dates from a busy 60-90 day-old stretch — and nobody reads
//                        alerts that old (the bell shows the latest 10).
//   hr_typing_indicators delete rows not updated in 1 day (a typing marker is only
//                        meaningful for a few seconds)
//   hr_rate_limits       delete rows not updated in 2 days (login / reset windows
//                        last minutes to hours)
//
// Deliberately NOT touched: timesheets, absence records, leaves, tickets, payroll,
// inactivity logs and screenshots (HR/payroll history and their own retention
// rules), and the per-user read/cleared id lists (stale ids in them are harmless).
//
// Runs once a day at 03:30 server time. Each run deletes at most MAX_PER_TABLE rows
// per table, oldest first, in small batches — a large backlog (the first run) drains
// over a few nights instead of holding SQLite's single write lock for minutes.
//
// NOTE: written for PocketBase v0.22.x's pre-v0.23 JS hooks API (cronAdd,
// $app.dao()), same as auto_close_stale_shifts.pb.js. As noted there, every helper
// and constant is declared INSIDE the cronAdd callback — PocketBase's JSVM does not
// keep top-level declarations visible to a scheduled callback.
//
// The same filters are mirrored by the `previewRetention` action in
// src/app/api/admin/schema-migration/route.ts, which reports how many rows each rule
// would remove without deleting anything. Keep the two in sync.

cronAdd("retention_cleanup", "30 3 * * *", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const BATCH = 200;
  const MAX_PER_TABLE = 5000;
  const NOTIFICATION_RETENTION_DAYS = 60; // keep in sync with previewRetention in schema-migration/route.ts

  // PocketBase stores dates as "YYYY-MM-DD HH:MM:SS.mmmZ" — string comparison works.
  function cutoffDaysAgo(days) {
    return new Date(Date.now() - days * DAY_MS).toISOString().replace("T", " ");
  }

  // Deletes records matching `filter`, oldest first, up to MAX_PER_TABLE. Returns the count.
  function prune(dao, collection, filter, params) {
    let deleted = 0;
    while (deleted < MAX_PER_TABLE) {
      let batch;
      try {
        batch = dao.findRecordsByFilter(collection, filter, "created", BATCH, 0, params);
      } catch (err) {
        console.log("[retention_cleanup] lookup failed for", collection, err);
        break;
      }
      if (!batch || batch.length === 0) break;
      let removedThisBatch = 0;
      batch.forEach((record) => {
        try {
          dao.deleteRecord(record);
          removedThisBatch++;
        } catch (err) {
          console.log("[retention_cleanup] delete failed for", collection, record.id, err);
        }
      });
      deleted += removedThisBatch;
      // Nothing could be deleted (e.g. a rule/relation blocks it): stop rather than loop forever.
      if (removedThisBatch === 0 || batch.length < BATCH) break;
    }
    return deleted;
  }

  try {
    const dao = $app.dao();
    const notifications = prune(dao, "hr_notifications", "created < {:cutoff}", { cutoff: cutoffDaysAgo(NOTIFICATION_RETENTION_DAYS) });
    const typing = prune(dao, "hr_typing_indicators", "updated < {:cutoff}", { cutoff: cutoffDaysAgo(1) });
    const rateLimits = prune(dao, "hr_rate_limits", "updated < {:cutoff}", { cutoff: cutoffDaysAgo(2) });
    console.log("[retention_cleanup] removed notifications=" + notifications + " typing=" + typing + " rate_limits=" + rateLimits);
  } catch (err) {
    console.log("[retention_cleanup] hook error:", err);
  }
});
