// Shared helper for sending real OneSignal push notifications from
// PocketBase's server-side JS hooks (push_notifications.pb.js and
// push_announcements.pb.js in this same folder both `require()` this file).
//
// This is a plain module, NOT a *.pb.js hook file itself — PocketBase only
// auto-registers *.pb.js files as hooks, so this one is safe to load via
// require() without it trying to run as a hook on its own.
//
// Needs two environment variables set wherever PocketBase itself runs
// (see the pocketbase.service systemd unit on the droplet — same file
// edited during the HTTPS migration):
//   ONESIGNAL_APP_ID        - same App ID already pasted into
//                             src/lib/push.ts in the main app repo.
//   ONESIGNAL_REST_API_KEY  - OneSignal dashboard -> Settings -> Keys & IDs
//                             -> REST API Key. NOT the App ID, and NEVER
//                             put this in the app's own code/repo — the
//                             whole point of this server-side setup is
//                             keeping this key off any device.
//
// See Notes/PUSH_NOTIFICATIONS_SETUP.md for the full deployment steps.

module.exports = {
  // emails: array of employee email addresses (these match the
  // "external_id" each device registers under — see loginPush() /
  // OneSignal.login(email) in src/lib/push.ts). title/message are plain
  // strings, no localization needed for this app.
  sendPush: function (emails, title, message) {
    const appId = $os.getenv("ONESIGNAL_APP_ID");
    const apiKey = $os.getenv("ONESIGNAL_REST_API_KEY");

    if (!appId || !apiKey) {
      console.log("[onesignal_helper] ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY env var missing — skipping push. See Notes/PUSH_NOTIFICATIONS_SETUP.md.");
      return;
    }
    if (!emails || emails.length === 0) {
      return;
    }

    const body = {
      app_id: appId,
      target_channel: "push",
      include_aliases: { external_id: emails },
      contents: { en: message },
      headings: { en: title },
    };

    try {
      const res = $http.send({
        url: "https://api.onesignal.com/notifications",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": "Key " + apiKey,
        },
        body: JSON.stringify(body),
      });

      if (res.statusCode >= 300) {
        console.log("[onesignal_helper] OneSignal responded with an error:", res.statusCode, res.body);
      }
    } catch (err) {
      console.log("[onesignal_helper] Request to OneSignal failed:", err);
    }
  },
};
