/// <reference path="../pb_data/types.d.ts" />

// Fired every time a new row is created in hr_notifications (i.e. every
// call to hrActions.addNotification(...) in the app — see hrData.ts) and,
// if it's one of the 3 pushable categories below, sends a real OneSignal
// push to whoever it's addressed to (after checking their own Settings
// preferences — see NotificationPreferencesCard.tsx / getNotificationPrefs
// in hrData.ts).
// Updated: 2026-08-10 for smart tracker inactivity alerts.
//
// 'announcement' is NOT handled here — hr_announcements is a totally
// separate collection that never goes through addNotification, so it gets
// its own hook: push_announcements.pb.js.
//
// Requires the `category` field to exist on hr_notifications (Admin UI:
// Collections -> hr_notifications -> add field "category", type Plain
// text) — see Notes/PUSH_NOTIFICATIONS_SETUP.md.
//
// NOTE: written for PocketBase v0.22.x's pre-v0.23 JS hooks API — this
// droplet runs 0.22.14. onRecordAfterCreateSuccess/$app.findRecordsByFilter
// don't exist yet at this version; the equivalents here are
// onRecordAfterCreateRequest, $app.dao().findRecordsByFilter(...), and
// $app.dao().findFirstRecordByData(...) (a single key/value match instead
// of a filter expression) — and no e.next() call, unlike v0.23+ hooks.
// If PocketBase ever gets upgraded past v0.23, this file (and
// push_announcements.pb.js) will need updating to the newer hook names —
// see https://pocketbase.io/v023upgrade/jsvm/ for the full mapping.
onRecordAfterCreateRequest((e) => {
  try {
    const onesignal = require(`${__hooks}/onesignal_helper.js`);

    const category = e.record.get("category");
    // "maintenance" (System Maintenance Notices — see MaintenanceNotice in
    // hrData.ts, added 2026-08-04) is deliberately NOT opt-out-able: an
    // employee shouldn't be able to silence "the whole system is about to
    // go down," so unlike the other 4 categories here it skips the
    // per-recipient prefs filter below entirely (see the `allowed` step).
    const pushableCategories = ["ticket", "leave_task", "chat_mention", "shift", "maintenance"];
    console.log("[push_notifications] fired, category=", category);
    if (pushableCategories.indexOf(category) === -1) {
      console.log("[push_notifications] category not pushable, skipping");
      return;
    }

    const recipientEmail = e.record.get("recipient_email");
    const recipientRole = e.record.get("recipient_role");
    const message = e.record.get("message");
    const pushTitle = e.record.get("push_title");
    const senderEmail = e.record.get("sender_email");

    // Resolve the actual employee email(s) this notification is addressed
    // to — either a single specific person, or every profile with a given
    // role (the "all"/'hr' or "all"/'admin' broadcast pattern used
    // throughout hrData.ts).
    let emails = [];
    if (recipientEmail && recipientEmail !== "all") {
      emails = [recipientEmail];
    } else if (recipientRole) {
      const profiles = $app.dao().findRecordsByFilter(
        "hr_profiles",
        "role = {:role}",
        "",
        2000,
        0,
        { role: recipientRole }
      );
      emails = profiles.map((p) => p.get("email")).filter(Boolean);
    }
    console.log("[push_notifications] resolved recipient emails=", JSON.stringify(emails));
    if (emails.length === 0) {
      console.log("[push_notifications] no recipient emails resolved, skipping");
      return;
    }

    // Drop anyone who's turned this category off in their Settings.
    // Missing/never-configured = still on (opt-out model), matching
    // hrActions.getNotificationPrefs's default in the app.
    let prefsMap = {};
    try {
      const prefsRow = $app.dao().findFirstRecordByData("hr_delcargo_store", "key", "hr_notification_prefs_v1");
      const raw = prefsRow.get("value");
      prefsMap = raw && typeof raw === "object" ? raw : JSON.parse(raw || "{}");
    } catch (err) {
      prefsMap = {}; // no prefs row yet — everyone defaults to on
    }

    // "maintenance" bypasses the opt-out check entirely — see the comment
    // on pushableCategories above. Every other category still respects
    // whatever the recipient set in NotificationPreferencesCard.
    const allowed = category === "maintenance"
      ? emails
      : emails.filter((email) => {
          const p = prefsMap[email.toLowerCase()];
          return !p || p[category] !== false;
        });
    console.log("[push_notifications] prefsMap=", JSON.stringify(prefsMap), "allowed=", JSON.stringify(allowed));

    if (allowed.length > 0) {
      // WhatsApp-style title: prefer the contextual title the client sent
      // (ticket subject, Team Chat sender's name, etc. — see the
      // pushTitle/senderEmail comment on hrActions.addNotification in
      // hrData.ts), falling back to a generic per-category label if it's
      // missing (e.g. notifications created before this field existed, or
      // system actions with no natural "contact").
      const fallbackTitles = { ticket: "Support Ticket", leave_task: "Leave & Tasks", chat_mention: "Team Chat", shift: "Shift Update", maintenance: "System Maintenance" };
      const title = pushTitle || fallbackTitles[category] || "Delcargo Internal";

      // Resolve the sender's profile picture (if we have their email) to
      // show as the Android large icon — the WhatsApp-style avatar. Best
      // effort: a missing/failed lookup just means no avatar, never blocks
      // the push itself. When there's no real "contact" (system/workflow
      // notifications like leave decisions or ticket status changes, where
      // showing a specific person's photo isn't appropriate), fall back to
      // the app's own logo instead of leaving it blank — that's what was
      // rendering as a plain grey bell icon before.
      const APP_LOGO_URL = "https://delcargo-io.vercel.app/AppIcon.png";
      let largeIcon = APP_LOGO_URL;
      if (senderEmail) {
        try {
          // findFirstRecordByData does an exact, case-sensitive match on
          // "email". senderEmail here is always lowercase (it comes from
          // currentUserEmail, which auth/page.tsx normalizes at login — see
          // the identical case-mismatch bug already fixed in
          // onesignal_helper.js), but hr_profiles.email itself isn't
          // guaranteed to be lowercase (e.g. "Faheem@delcargo.us"). An exact
          // match against a differently-cased stored email silently finds
          // nothing, throws when .get() is called on the empty result, and
          // falls back to the app logo — which is exactly why the sender's
          // real profile picture wasn't showing up on chat_mention pushes
          // even though the same lookup pattern happens to work elsewhere.
          //
          // Fix: narrow candidates with a case-insensitive LIKE (SQLite's
          // `~` operator is case-insensitive for ASCII by default), then
          // confirm an exact case-insensitive match in JS so a substring
          // hit (e.g. "fa@x.com" matching "fa@x.com.au") can never produce
          // a false positive.
          const senderEmailLower = String(senderEmail).toLowerCase();
          const candidates = $app.dao().findRecordsByFilter(
            "hr_profiles",
            "email ~ {:email}",
            "",
            50,
            0,
            { email: senderEmailLower }
          );
          const senderProfile = candidates.find((p) => String(p.get("email")).toLowerCase() === senderEmailLower);
          // profile_picture_file is a real PocketBase file field (migrated
          // off the old profile_picture text column, which stored the whole
          // image as an inline base64 string — OneSignal's large_icon field
          // needs a URL it can actually fetch over HTTP(S), it can't render
          // a base64 data URI, so that never worked as a push icon no matter
          // how correctly this lookup found the right profile). PocketBase's
          // file URL shape is {baseUrl}/api/files/{collection}/{recordId}/{filename}.
          // Falls back to the app logo for anyone who hasn't uploaded a
          // picture (empty filename) or hasn't been migrated to the new
          // field yet.
          const pictureFilename = senderProfile && senderProfile.get("profile_picture_file");
          largeIcon = pictureFilename
            ? `https://pb.delcargo.us/api/files/hr_profiles/${senderProfile.id}/${pictureFilename}`
            : APP_LOGO_URL;
        } catch (err) {
          largeIcon = APP_LOGO_URL;
        }
      }

      onesignal.sendPush(allowed, title, message, { largeIcon: largeIcon });
    } else {
      console.log("[push_notifications] everyone filtered out by prefs, not sending");
    }
  } catch (err) {
    // A hook error here must never break the actual notification/record
    // creation the rest of the app depends on — log and move on.
    console.log("[push_notifications] hook error:", err);
  }
}, "hr_notifications");
