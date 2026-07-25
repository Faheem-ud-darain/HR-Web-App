# Push Notifications (OneSignal) — Setup Guide

The code side of this is already wired up (see "What's already done" below).
What's left is account/credential setup on OneSignal's, Google's, and
Apple's own sites — none of that can be done from inside this codebase, it
has to happen in your browser / Xcode.

This app uses OneSignal for exactly one thing: push notifications. Nothing
else (no email, SMS, in-app messages, journeys) is wired up, and none of
that needs to be — ignore those sections of OneSignal's dashboard.

## 1. Create your OneSignal app

1. Go to https://onesignal.com and sign up for a free account.
2. Click **New App/Website**, name it (e.g. "DelCargo HR"), and choose
   **Apple iOS (APNs)**, **Google Android (FCM)**, and **Web Push** as your
   platforms (pick whichever of the three you actually need — you said all
   three).
3. Once created, go to **Settings → Keys & IDs** and copy the **OneSignal
   App ID** (a UUID like `1234abcd-...`).
4. Open `src/lib/push.ts` in this repo and replace:
   ```ts
   export const ONESIGNAL_APP_ID = 'YOUR_ONESIGNAL_APP_ID';
   ```
   with your real App ID. That's the only line you need to touch.

## 2. Android — Firebase credentials

OneSignal needs your Firebase project's credentials to deliver Android
push. You do **not** need to add a `google-services.json` file to this
repo — everything goes into the OneSignal dashboard instead.

Google has fully retired the old "Cloud Messaging API (Legacy)" Server Key,
so new Firebase projects use a **service account JSON key** instead. This
is the method to use for any project created from mid-2024 onward:

1. If you don't already have one, create a free Firebase project at
   https://console.firebase.google.com.
2. In Firebase: click the gear icon → **Project settings** → **Service
   accounts** tab → **Generate new private key** button. Confirm the
   download — this saves a `.json` file. Treat this file like a password:
   it's full admin credentials to your Firebase project. Its only
   destination is the OneSignal upload in the next step — never commit it
   to this repo or share it anywhere else.
3. In OneSignal: **Settings → Platforms → Google Android (FCM)** — there's
   an option to upload that service account JSON file directly (this
   replaced the old copy-paste Server Key + Sender ID fields). Upload it
   there.
   (OneSignal's own doc page has the current screenshots if their dashboard
   layout has moved anything since this was written:
   https://documentation.onesignal.com/docs/android-firebase-credentials)
4. Run, from this project's root:
   ```
   npm install
   npx cap sync android
   ```

## 3. iOS — Apple Push Notification key

1. In your Apple Developer account (https://developer.apple.com/account):
   **Certificates, Identifiers & Profiles → Keys → +** — create a new key
   with **Apple Push Notifications service (APNs)** enabled. Download the
   `.p8` file (Apple only lets you download it once — keep it safe) and
   note the **Key ID** and your **Team ID**.
2. In OneSignal: **Settings → Platforms → Apple iOS (APNs)** — upload that
   `.p8` file along with the Key ID and Team ID.
3. Open the iOS project in Xcode (`npx cap open ios` from this repo, after
   running `npm install && npx cap sync ios`).
4. In Xcode: select the **App** target → **Signing & Capabilities** tab →
   **+ Capability** → add **Push Notifications**. This is a one-click
   toggle — Xcode writes the entitlement for you.
5. Build/run from Xcode to a real device or simulator to test (push doesn't
   work in the iOS Simulator before Xcode 14/iOS 16, so use a real device
   if your Xcode/iOS is older).

## 4. Web push (browser)

Nothing extra needed beyond step 1 — `public/OneSignalSDKWorker.js` and the
script tag in `src/app/layout.tsx` are already in place. Just make sure
**Web Push** is one of the platforms you enabled in step 1, and that your
site's URL is set correctly under **Settings → Platforms → Web Push**
(OneSignal will ask for your production domain).

## 5. Android — branded notification icon/color

Without this, Android push notifications show a generic white bell in a
grey circle (this is what you saw in your first test push) instead of
your app's own branding.

1. Go to https://romannurik.github.io/AndroidAssetStudio/icons-notification.html
   (the standard tool OneSignal's own docs recommend for this).
2. Upload `AppIcon.png` (already in this repo's root) as the source image.
3. Name the asset **exactly** `ic_stat_onesignal_default` — OneSignal's
   SDK looks for that filename automatically, no code/config needed to
   point at it.
4. Download the generated zip. It contains folders like
   `drawable-mdpi/`, `drawable-hdpi/`, `drawable-xhdpi/`,
   `drawable-xxhdpi/`, `drawable-xxxhdpi/`, each with one
   `ic_stat_onesignal_default.png`.
5. Copy all of those `drawable-*dpi` folders into
   `android/app/src/main/res/` in this repo, merging with what's already
   there (don't delete the existing `drawable`/`drawable-v24` folders —
   just add the new dpi-specific ones alongside them).
6. Rebuild the APK the usual way. The accent color (brand orange) is
   already wired into `AndroidManifest.xml` — no extra step needed for that
   part.

## 6. Server-side push sender (PocketBase hooks)

This is the part that actually triggers a push when something happens in
the app — a ticket reply, a leave decision, a Team Chat mention, or a new
announcement — rather than only ever sending pushes manually from
OneSignal's dashboard. It runs entirely on your droplet (same one running
PocketBase), so the OneSignal REST API key never touches this app's code
or ships inside the APK/website.

### 6a. Get your OneSignal REST API Key

In OneSignal: **Settings → Keys & IDs** — copy the **REST API Key** (this
is different from the App ID you already pasted into `push.ts`; don't mix
them up).

### 6b. Add fields to hr_notifications

Open `https://pb.delcargo.us/_/` (PocketBase Admin UI) → **Collections** →
**hr_notifications** → edit the collection's fields → **+ New field** for
each of these three (all **Plain text**, none required):

- `category` — drives whether a push is sent at all (see step 6e).
- `push_title` — the WhatsApp-style bold title (a ticket's subject, the
  Team Chat sender's name, "Leave Approved", etc.) — see step 6c below.
- `sender_email` — the "contact" this notification is from, used to look
  up their profile picture as the Android large icon/avatar.

Save.

### 6c. WhatsApp-style title + avatar (already implemented)

As of this update, notifications no longer show the generic app name
("Delcargo Internal") as the bold title — Android already shows the app's
own name/icon in a separate row above every notification automatically,
so repeating it was redundant. Instead, the title now shows whatever's
contextually relevant: a ticket's subject line, the Team Chat sender's
name, "Leave Approved"/"Leave Rejected", etc. (this logic lives in
`hrData.ts`'s `addNotification` calls and `pb_hooks/push_notifications.pb.js`).
Where the client passes a sender's email along, the hook looks up their
`hr_profiles` picture and sends it as the notification's large icon
(Android only — OneSignal's `large_icon` field). Nothing extra to
configure here beyond the fields in 6b — this is automatic once the app
is rebuilt and the fields exist.

**Lock-screen content hiding**: I checked OneSignal's current REST API
reference (documentation.onesignal.com/reference/push-notification) and
there is no simple "hide on lock screen" field like `android_visibility`
in it — I want to flag that clearly rather than guess. The real
mechanism is an **Android Notification Category (channel)**: in the
OneSignal dashboard, go to **Settings → Android Notification Categories**,
create one (e.g. "Private Content") with its **Visibility** set to
**Private**, and copy its UUID. If you want this, tell me the UUID (or
create it and share it) and I'll wire `android_channel_id` through the
hooks so every push uses that channel — I've already added the
`channelId` option to `pb_hooks/onesignal_helper.js`'s `sendPush`
function, it just isn't being passed yet since there's no channel UUID
to put there. You should verify this Visibility behavior against
OneSignal's dashboard directly, since I'm relying on a documented
Android-channel concept rather than something I could test myself here.

### 6d. Set the two environment variables on the droplet

In the DigitalOcean web console (same terminal you used for the HTTPS
setup):

```
sudo nano /etc/systemd/system/pocketbase.service
```

Add two lines under the `[Service]` section (alongside the existing
`ExecStart` line):

```
Environment=ONESIGNAL_APP_ID=429b20a0-defd-4807-badd-460ec334cf35
Environment=ONESIGNAL_REST_API_KEY=paste_your_rest_api_key_here
```

Save (Ctrl+O, Enter, Ctrl+X), then:

```
sudo systemctl daemon-reload
sudo systemctl restart pocketbase
```

### 6d½. PocketBase version matters

The hook files in `pb_hooks/` are written for **PocketBase v0.22.x**
(confirmed via `pocketbase --version` on the droplet — this deployment
runs `0.22.14`). PocketBase rewrote its JS hooks API in v0.23 (new hook
names like `onRecordAfterCreateSuccess`, `$app.findRecordsByFilter(...)`
directly instead of `$app.dao().findRecordsByFilter(...)`, etc.) — if
PocketBase ever gets upgraded past v0.23 on this droplet, both
`push_notifications.pb.js` and `push_announcements.pb.js` will need
updating to match, or they'll fail with a `ReferenceError` exactly like
the one hit during initial setup. See
https://pocketbase.io/v023upgrade/jsvm/ for the full old→new mapping.
Worth knowing separately: v0.22.14 is over a year old at this point and
missing since-patched fixes — upgrading PocketBase itself would be a
reasonable thing to do as part of "securing the app more," just as its
own separate, deliberate task (schema/data compatibility across that many
versions needs care), not bundled into this one.

### 6e. Upload the hook files

This repo now has a `pb_hooks/` folder with 3 files:
`onesignal_helper.js`, `push_notifications.pb.js`, `push_announcements.pb.js`.

Copy that entire `pb_hooks` folder to sit **next to the `pocketbase`
executable** on your droplet (same directory as `pocketbase` and
`pb_data`) — e.g. via `scp`, or by pasting the file contents through the
DigitalOcean console with `nano`. PocketBase auto-loads (and on
UNIX-based systems, auto-restarts itself when it detects a change to)
anything in `pb_hooks/` — you don't need to restart it manually after
this step, but a restart doesn't hurt if you want to confirm it picked
the files up: `sudo systemctl restart pocketbase`.

### 6f. Test it

Have an employee open a support ticket, or post an announcement, or
@mention someone in Team Chat — a real push should arrive on whichever
device(s) the recipient(s) are signed into, respecting whatever they've
set in their own **Profile → Push Notifications** settings. Check
`sudo journalctl -u pocketbase -n 50` on the droplet if nothing arrives —
the hooks log to stdout on any error (missing env vars, OneSignal
rejecting the request, etc.).

## 7. Notification preferences (employee-configurable)

Every employee now has a **Push Notifications** card on their own Profile
page (Employee/HR/Admin all get the same one) with 4 toggles:
Announcements, Support tickets, Team Chat mentions, Leave & tasks. All
default to on. Turning one off only stops the *push* for that category —
the in-app notification bell always shows everything regardless, same as
before this feature existed. Preferences are stored server-side (KV key
`hr_notification_prefs_v1`), which is what the hooks in step 6 read
before sending anything.

## 8. Test it

- **Web**: run `npm run dev`, open the site, log in — you should get a
  browser permission prompt. Approve it, then send yourself a test push
  from OneSignal's dashboard (**Messages → New Push**, target "Test
  Devices" or "All Users").
- **Android**: `npx cap sync android && npx cap open android`, run on a
  device/emulator with Google Play Services, log in, approve the
  permission prompt, send a test push.
- **iOS**: same idea via `npx cap open ios`, on a real device (or a modern
  simulator).

## What's already done (code side)

- `src/lib/push.ts` — single module that initializes push for whichever
  shell the app is running in (native Capacitor vs. plain browser), and
  logs the signed-in user in to OneSignal under their email as the
  "external ID". That means once this is live, you can target a specific
  employee by email from OneSignal's dashboard/API, not just broadcast to
  everyone.
- Push init is triggered automatically after login, from
  `src/app/(dashboard)/layout.tsx`.
- Push logout (`logoutPush()`) is wired into both sign-out buttons
  (`Sidebar.tsx` and `TopNav.tsx`) so a shared/kiosk device doesn't keep
  the previous employee's push subscription linked to their account.
- `public/OneSignalSDKWorker.js` + `src/components/PushWebScript.tsx` —
  browser-only Web Push SDK loader (skipped entirely inside the native app,
  where the Capacitor plugin is used instead).
- `@onesignal/capacitor-plugin` (verified latest: `1.1.2`, compatible with
  this project's Capacitor 8.x) added to `package.json` — run `npm install`
  to pull it in.
- `pb_hooks/` — the server-side sender (see step 6). Every `hrActions.addNotification(...)`
  call in `hrData.ts` now tags itself with a `category` (`'ticket'` |
  `'leave_task'` | `'chat_mention'`, or omitted for internal-only
  notifications that never push), and `hrActions.addAnnouncement` rows are
  handled by their own hook — both check each recipient's preferences
  before sending.
- `NotificationPreferencesCard.tsx` — the Settings UI (step 7), rendered on
  all 3 role's Profile pages.
- Android notification branding (accent color) is wired into
  `AndroidManifest.xml`; the icon image set itself still needs generating
  once per icon change (step 5).

Until you paste in a real App ID, `initPush()` no-ops with a console
warning — the app works exactly as before, nothing breaks.
