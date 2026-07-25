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
  //
  // options (all optional):
  //   largeIcon  - URL of an image to show as the Android large icon
  //                (WhatsApp-style contact avatar). Confirmed field name
  //                from OneSignal's current push-notification API reference
  //                (documentation.onesignal.com/reference/push-notification):
  //                `large_icon`, described as "the local name or URL of the
  //                large icon to display in the Google Android notification".
  //   channelId  - UUID of an OneSignal "Android Notification Category"
  //                (channel) created in the OneSignal dashboard under
  //                Settings -> Android Notification Categories. This is how
  //                Android's per-notification lock-screen content-hiding
  //                actually works — there is NO plain `visibility`/
  //                `android_visibility` field in OneSignal's current REST
  //                API (verified against the live API reference; it isn't
  //                there), so hiding message content on the lock screen has
  //                to be done by creating a channel with its Visibility set
  //                to "Private" in the dashboard and passing that channel's
  //                UUID here as `android_channel_id`. See
  //                Notes/PUSH_NOTIFICATIONS_SETUP.md for the exact steps.
  sendPush: function (emails, title, message, options) {
    const appId = $os.getenv("ONESIGNAL_APP_ID");
    const apiKey = $os.getenv("ONESIGNAL_REST_API_KEY");
    const opts = options || {};

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
    if (opts.largeIcon) body.large_icon = opts.largeIcon;
    if (opts.channelId) body.android_channel_id = opts.channelId;

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

      // Logged on success too (temporarily, for diagnosing why a push isn't
      // arriving) — OneSignal can return 200 with zero matched recipients,
      // which isn't an "error" from its point of view but means nobody
      // actually got the push, and that only shows up in this response body.
      console.log("[onesignal_helper] OneSignal response:", res.statusCode, res.body);
    } catch (err) {
      console.log("[onesignal_helper] Request to OneSignal failed:", err);
    }
  },
};
