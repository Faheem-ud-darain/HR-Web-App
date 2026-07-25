/// <reference path="../pb_data/types.d.ts" />

// Fires on every new hr_announcements row (hrActions.addAnnouncement in
// hrData.ts) and sends a real OneSignal push to whoever it's targeted at,
// after checking each recipient's own "announcement" Settings preference
// (see NotificationPreferencesCard.tsx).
//
// NOTE — target field caveat: as of when this hook was written,
// hrActions.addAnnouncement collapses a specific-warehouses target array
// down to the literal string "all" before saving (see the `target:
// typeof target === 'string' ? target : 'all'` line in hrData.ts) — so a
// warehouse-scoped announcement is already being broadcast to every
// employee today, in-app bell included, not just for push. This hook only
// handles the 3 values that are actually ever persisted right now: "all",
// "usa", "pakistan".
//
// NOTE: written for PocketBase v0.22.x's pre-v0.23 JS hooks API (this
// droplet runs 0.22.14) — see the matching comment in
// push_notifications.pb.js for the old/new API differences.
onRecordAfterCreateRequest((e) => {
  try {
    const onesignal = require(`${__hooks}/onesignal_helper.js`);

    const target = e.record.get("target");
    const title = e.record.get("title");
    const content = e.record.get("content");

    let profiles = [];
    if (target === "usa" || target === "pakistan") {
      const region = target === "usa" ? "USA" : "Pakistan";
      profiles = $app.dao().findRecordsByFilter(
        "hr_profiles",
        "region = {:region}",
        "",
        2000,
        0,
        { region: region }
      );
    } else {
      // "all", or anything unexpected — broadcast to everyone, matching
      // the in-app bell's own behavior for the same row.
      profiles = $app.dao().findRecordsByFilter("hr_profiles", "", "", 2000, 0, {});
    }

    let emails = profiles.map((p) => p.get("email")).filter(Boolean);
    if (emails.length === 0) {
      return;
    }

    let prefsMap = {};
    try {
      const prefsRow = $app.dao().findFirstRecordByData("hr_delcargo_store", "key", "hr_notification_prefs_v1");
      const raw = prefsRow.get("value");
      prefsMap = raw && typeof raw === "object" ? raw : JSON.parse(raw || "{}");
    } catch (err) {
      prefsMap = {};
    }

    emails = emails.filter((email) => {
      const p = prefsMap[email.toLowerCase()];
      return !p || p.announcement !== false;
    });

    if (emails.length > 0) {
      // Same app-logo fallback as push_notifications.pb.js — an
      // announcement isn't "from" a specific contact, so use the app's own
      // icon as the large icon instead of the default grey bell.
      onesignal.sendPush(emails, "📢 " + title, content, { largeIcon: "https://delcargo-io.vercel.app/AppIcon.png" });
    }
  } catch (err) {
    console.log("[push_announcements] hook error:", err);
  }
}, "hr_announcements");
