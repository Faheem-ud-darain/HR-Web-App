/// <reference path="../pb_data/types.d.ts" />

// Fires every time a new row is created in hr_notifications (i.e. every
// call to hrActions.addNotification(...) in the app — see hrData.ts) and,
// if it's one of the 3 pushable categories below, sends a real OneSignal
// push to whoever it's addressed to (after checking their own Settings
// preferences — see NotificationPreferencesCard.tsx / getNotificationPrefs
// in hrData.ts).
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
    const pushableCategories = ["ticket", "leave_task", "chat_mention"];
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

    const allowed = emails.filter((email) => {
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
      const fallbackTitles = { ticket: "Support Ticket", leave_task: "Leave & Tasks", chat_mention: "Team Chat" };
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
          const senderProfile = $app.dao().findFirstRecordByData("hr_profiles", "email", senderEmail);
          largeIcon = senderProfile.get("profile_picture") || APP_LOGO_URL;
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
