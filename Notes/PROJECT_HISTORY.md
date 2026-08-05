# DelCargo HR / Internal App — Project History & Handoff

Last updated: 2026-08-03. Written as a running handoff document — read this
before starting new work, and add to it (don't replace it) as more gets done.

## 1. What this app is

Next.js 16 (App Router) + Capacitor 8 (Android + iOS) + PocketBase 0.22.14
backend. Static export build for Capacitor (`output: 'export'`, gated by
`CAPACITOR_BUILD=true`, see `scripts/build-for-capacitor.mjs`). Three
dashboard roles: `employee`, `hr`, `admin` (plus `team_lead`, a variant of
employee). A separate desktop "DelCargo Tracker" agent app (not in this repo)
reports screenshots/inactivity/heartbeats for employees whose HR/Admin has
enabled workstation tracking.

**Data layer rule (from `src/lib/hrData.ts`'s own header comment, still
true, still enforced):**
> No page/component may call `pb.collection(...)` directly. Every read goes
> through the `use*()` hooks (React Query, in-memory cache only, never
> localStorage). Every write goes through `hrActions.*`.

Known exception: `ToastNotification.tsx` calls `pb.collection('hr_notifications')`
directly — a pre-existing violation of rule 1, not something introduced
recently. Worth cleaning up eventually but not urgent.

PocketBase collections currently in use: `hr_profiles`, `hr_leaves`,
`hr_notifications`, `hr_warehouses`, `hr_tasks`, `hr_announcements`,
`hr_careers`, `hr_career_applications`, `hr_tickets`, `hr_payroll`,
`hr_teams`, `hr_messages`, `hr_team_documents`, `hr_timesheets`,
`hr_delcargo_store` (generic key/value store — see rule 3 in hrData.ts),
`hr_screenshots`, `hr_inactivity_logs`.

## 2. Existing Notes/ docs — what's current, what's stale

- **HANDOFF_NOTES.md** — STALE. Describes the old Supabase-based
  architecture (`db.ts`, RLS) for the screen-tracking feature. The app has
  since migrated fully to PocketBase; this doc's concrete file references no
  longer match reality. Some bug-pattern lessons in it (case-insensitive
  email matching, stale-cache races) are still conceptually useful.
- **SCHEMA_REFERENCE.md** — Mostly current (dated 2026-07-09), PocketBase-era,
  but a partial snapshot — doesn't include newer collections (`hr_payroll`,
  `hr_teams`, `hr_messages`, `hr_team_documents`, `hr_timesheets`,
  `hr_screenshots`, `hr_inactivity_logs`). Don't treat it as exhaustive.
- **PUSH_NOTIFICATIONS_SETUP.md** — current, matches the live `pb_hooks/*`
  push files.
- **SPLASH_AND_ICON_SETUP.md** — current (one-time manual asset-copy steps).
- **IOS_BUILD_SETUP.md** — current, explains the `npm run build` vs
  `npm run build:capacitor` / `out/` folder gotcha.
- **DEPLOY_PB_HOOKS_SETUP.md** — current, one-time GitHub Actions + SSH
  keypair setup for auto-deploying `pb_hooks/*.js` to the droplet. **This
  pipeline is live and confirmed working** (verified via a real
  auto-triggered `systemctl restart pocketbase` in droplet logs).
- **PROJECT_HISTORY.md** — this file, new, meant to be the up-to-date
  master reference going forward.

## 3. pb_hooks/ (server-side PocketBase JS hooks, droplet at pb.delcargo.us)

- `onesignal_helper.js` — shared REST-call logic for OneSignal pushes.
  Needs `ONESIGNAL_APP_ID`/`ONESIGNAL_REST_API_KEY` env vars on the droplet
  (never in this repo). Lowercases every recipient email before sending
  (fixes a case-sensitivity bug where OneSignal's `external_id` alias
  matching failed against mixed-case server emails).
- `push_notifications.pb.js` — fires on new `hr_notifications` rows for
  pushable categories (`ticket`, `chat_mention`, `leave_task`, `shift` — NOT
  `announcement`, handled separately). Looks up the sender's profile
  picture (real PocketBase file field, `profile_picture_file`) to use as
  the Android push's large icon; falls back to `APP_LOGO_URL`
  (`https://delcargo-io.vercel.app/AppIcon.png`) when there's no sender
  (e.g. system-generated notifications).
- `push_announcements.pb.js` — fires on new `hr_announcements` rows, same
  OneSignal send, targets `all`/`usa`/`pakistan` (warehouse-specific
  targeting already collapses to `all` client-side before it reaches here).
- **No server-side cron exists anywhere in this app.** Every "periodic
  check" (screenshot retention sweep, stale-shift-abandoned check,
  absence-notification check) is client-triggered from a dashboard page's
  `useEffect` on mount, guarded to no-op if nothing's actually due. If a true
  server cron is ever needed, PocketBase 0.22.x's JS hooks support
  `cronAdd(id, cronExpr, handler)` — not used yet.

## 4. Feature history (most recent first)

### Timezone lock (America/New_York only, no device/IP timezone)
Per explicit product decision, the entire app displays exactly one
timezone — `America/New_York` — regardless of the employee's or viewer's
own device location. New file `src/lib/timezone.ts` (`APP_TIMEZONE`,
`formatTimeNY`, `formatDateNY`, `formatShortDateNY`, `formatDateTimeNY`,
`getNYDateString`, `formatRelativeDateNY`) is the single source of truth —
use these instead of raw `.toLocaleTimeString()`/`.toLocaleDateString()`
calls. Fixed the real underlying bug too: shift date-bucketing
(`localShiftDate` in hrData.ts, and `clockIn()`'s `date` field) used to
derive the calendar day from UTC or the *viewer's own device* timezone,
which could misfile a late-night shift under the wrong day. Every wall-clock
display across the app (notifications, clock in/out, tracking logs, chat/
ticket timestamps) now explicitly renders in NY. Deliberately left plain
calendar-only fields (task due dates, leave dates, salary anniversary date,
profile joined-date — all stored as bare `YYYY-MM-DD` with no time
component) unconverted, since forcing a timezone conversion on those would
shift the displayed date backward a day (a different, unrelated bug class).

### App version tracking card
New `src/lib/appVersion.ts` (`APP_VERSIONS = { web, android, ios }`,
hand-maintained, no way to read live from `package.json`/`build.gradle`/
`project.pbxproj` at runtime) + `src/components/ui/AppVersionCard.tsx`,
wired into all 3 Profile Settings pages (employee/hr/admin). Shows all 3
platform versions, tags the current one via `Capacitor.getPlatform()`.
**Current version: 1.4, build 1**, synced across `package.json`,
`android/app/build.gradle` (`versionName`), and
`ios/App/App.xcodeproj/project.pbxproj` (both Debug AND Release configs'
`MARKETING_VERSION` — a Release-config miss was caught and fixed
2026-08-03). **Process going forward: bump this file + the 3 native config
locations together whenever a real version bump happens, and always confirm
with the user whether they've pushed before assuming a version is live.**

### No-call-no-show auto-absence system (original design)
Pakistan-region employees only (USA staff auto clock-in via GPS geofence,
so a missed shift there means something different — a device/GPS issue, not
a no-show). New pure helper `countAbsentWeekdays(profile, timesheets,
leaves, today)` in hrData.ts: counts weekdays (Mon-Fri, NY calendar) in the
current pay month, from the 1st through yesterday (today never counts —
its 24 hours haven't elapsed), where the employee has no timesheet shift
and no approved leave. Folded into `computePayrollView` (now takes an
optional `timesheets` param) as `absentDeduction = round(absentDays * 2 *
dailyRate)`, added alongside the existing `urgentDeduction` — same "2 days'
pay per day" multiplier the app already used for unapproved urgent leave, so
this wasn't a new invented penalty rate, it matches precedent.
`hr/payroll/page.tsx` shows a red "No-Show (Nd, $X)" badge per employee
(desktop + mobile), mirroring the existing Urgent Leave badge.
`checkAndNotifyAbsences(employees, timesheets, leaves)` is the
notification side — client-triggered from both `hr/page.tsx` and
`admin/page.tsx`'s `useEffect` on mount (whichever loads first "wins";
calling it from both is safe, it dedupes). Tracks "last notified count" per
employee **and per month** (`hr_absence_notified_v1` KV key
`${employeeId}:${YYYY-MM}`) so a new month always starts the comparison at
0 rather than inheriting last month's final tally. Fires one notification
each to HR, Admin, and the affected employee when a NEW absence is detected
(not a repeat notification for the same absence on every dashboard load).

**This original design is being extended (see section 5, "in progress")
to also mark absent via mouse-inactivity tracking, add an explanatory popup
for the employee, and a dedicated Absent Details page — that work starts
right after this document.**

### Admin dashboard mobile UI fixes
- Warehouse names like `"W1 ( Wilmington )"` were wrapping badly on
  mobile (closing paren dropping to its own line) — root cause: stored
  names have literal spaces inside the parens, making the browser treat
  `(`/`)` as separate breakable words. Fixed via display-time
  normalization in `admin/warehouses/page.tsx` (regex strips the inner
  spaces) rather than requiring a data migration.
- Public `/careers` page was overflowing horizontally on mobile (heading
  cut off, category tabs overflowing off-screen) even though
  `CareersView.tsx` itself already had correct overflow-safe classes
  (`break-words`, `overflow-x-auto`). Root cause: the *public* careers route
  (`src/app/careers/page.tsx` + root `layout.tsx`) had zero
  `overflow-x-hidden` guard anywhere in its container chain — unlike the
  logged-in dashboard shell, which already has 3 layers of that exact
  protection. `CareersView`'s internal fixes only clip overflow *within*
  itself; with nothing clipping above it, the whole page became
  horizontally scrollable. Fixed by adding `overflow-x-hidden`/`min-w-0` to
  `body` (root layout.tsx) and the public careers page's root div + `<main>`.
- Small stray element near the notification bell on the top nav —
  reported but **never root-caused**. Best guess (unconfirmed): the unread
  badge circle being partially clipped by safe-area padding on first paint.
  Not yet fixed — needs a live DOM inspection, not more code-reading.

### Push notification logo (old vs new)
`public/AppIcon.png` (256×256, orange background, old "ID card" logo) was
still live and used as the OneSignal push fallback large icon (`APP_LOGO_URL`
in both `push_notifications.pb.js` and `push_announcements.pb.js`) —
never regenerated when the app's real icon was redone (that work only
touched `resources/icon.png`, the native Capacitor icon source, which is a
separate file from this one). Confirmed via direct image read. **Not yet
fixed** — the sandbox ran out of disk space mid-session before the
replacement PNG could be generated/copied in. `public/AppIcon.png.png`
(duplicate) and `public/SplashIcon.png` (old orange, explicitly called out
as superseded in `capacitor.config.ts`'s own comments) are also dead/stale
files sitting in `public/` but referenced nowhere live.

### Profile picture in push notifications
Root problem: `profile_picture` was a plain base64-data-URL text field,
which OneSignal's `large_icon` can't use (needs a real fetchable HTTP(S)
URL). Solution chosen (over a quicker serving-endpoint patch): a real
PocketBase file field, `profile_picture_file`, on `hr_profiles`. Client
upload path fully wired (`hrActions.uploadProfilePicture`,
`updateProfileDetails` strips `profilePicture` out of the plain-JSON update
and calls the new upload action instead; `toProfile` prefers
`profile_picture_file` via `pb.files.getURL`, falling back to the old text
field). Server-side `push_notifications.pb.js` builds the file URL as
`https://pb.delcargo.us/api/files/hr_profiles/{id}/{filename}`.
One-time migration script `migration_data/migrate_profile_pictures_to_files.mjs`
exists (Node 18+, no deps) to backfill existing employees' base64 photos
into the new file field. **Status: user ran the migration BEFORE creating
the `profile_picture_file` field in PocketBase**, so the first run almost
certainly uploaded nothing. The field has since been created (confirmed via
screenshot: type File, single, no MIME restriction, 5,242,878 byte max).
**Needs a re-run** (`node migration_data/migrate_profile_pictures_to_files.mjs`)
and a spot-check of one employee record before the push notification's
picture can be considered actually verified working end-to-end.
Cleanup step explicitly deferred until the above is confirmed: delete the
old legacy `profile_picture` text field from `hr_profiles` in the
PocketBase Admin UI.

### GitHub Actions auto-deploy for pb_hooks
`.github/workflows/deploy-pb-hooks.yml` — SCP's `pb_hooks/*` to
`/root/pocketbase/pb_hooks` on the droplet then `systemctl restart
pocketbase`, on every push to `main` touching `pb_hooks/**` (or manual
`workflow_dispatch`). Setup docs in
`Notes/DEPLOY_PB_HOOKS_SETUP.md`. **Confirmed live and working** via a real
`journalctl` log showing an actual auto-triggered restart. Requires repo
secrets `PB_SSH_HOST`/`PB_SSH_USERNAME`/`PB_SSH_PRIVATE_KEY` (Admin role
needed to add secrets — the repo's original owner, the user's brother, had
to add them since the user only had Collaborator access).

### Shift push notifications (start/end/auto-end) with picture + name
New `'shift'` notification category. Pushed on: manual Start/End Shift
button (employee dashboard), GPS geofence auto check-in/out (USA), app-
closed auto-end (`closeStaleManualShiftIfAbandoned`), logout-triggered
auto-end (`performLogout`). Each includes the employee's display name
(`displayName(profile, 'hr')` — "FullName (alias)" for HR/Admin viewers)
and, once the profile-picture migration above is actually verified, their
profile picture as the Android push's large icon. **Confirmed arriving
on-device** with correct title/message (verified via a real Android
notification-shade screenshot: "Faheem Jadoon (Falcon) started shift
manually.").

### Notification UI polish
- Master "Notifications" on/off switch added to
  `NotificationPreferencesCard.tsx`, gating the per-category toggles until
  OS-level push permission is actually granted (checked live via
  `isPushEnabled()`, not just remembered).
- Persistent push-permission prompt shown on every login if OS notification
  permission is off.
- Notification bell dropdown (`TopNav.tsx`) now shows "Today"/"Yesterday"/
  a short date alongside the existing time string, derived from
  PocketBase's own `created` system field (always present regardless of
  what's in the app-written `timestamp` field) — now using
  `formatRelativeDateNY` per the timezone-lock work above.
- Mention-notification profile picture bug (case-sensitive `hr_profiles`
  email lookup in `push_notifications.pb.js`) — fixed via a case-insensitive
  `~` filter + exact JS re-check.

### App icon + splash screen
Real navy-background "DC" mark (`AppIconNoText.png`, user-supplied) is the
correct source for `resources/icon.png` (Capacitor native icon generation,
Android + iOS) and the Android notification small icon
(`ic_stat_onesignal_default.png` — regenerated via ImageMagick luminance-
threshold silhouette extraction, moved to the correct non-nested
`android/app/src/main/res/drawable-<density>/` path; the old dead
`android/app/src/main/res/res/` double-nested folder was deleted). Splash
screen (`SplashScreenOverlay.tsx`) got an added "Employee Portal" text line,
bigger D/C letters inside the speech-bubble icon, retimed entrance
animations (`globals.css`).

### Original push notification investigation (earliest work this history covers)
Root cause of pushes not arriving at all: OneSignal `external_id` alias
case-sensitivity mismatch between lowercase client login and possibly
mixed-case server-side emails — fixed by lowercasing every email before
sending (`onesignal_helper.js`) and before matching (`push_notifications.pb.js`).
A related `invalid_aliases` OneSignal error recurred once mid-session on an
otherwise-working pipeline; flagged as likely the same underlying issue
(stale OneSignal subscription state) and resolved by a reinstall/relogin,
though the exact trigger was never fully pinned down (see "known
unresolved issues" below).

## 5. Known unresolved / deferred issues

- **`invalid_aliases` OneSignal error, recurring** — same symptom as the
  original push-notification investigation. Has resolved itself via
  reinstall/relogin before, but the actual root cause/trigger condition was
  never conclusively identified. Watch for recurrence.
- **Stray UI element near the notification bell** — reported, not root-
  caused (see mobile UI fixes above). Needs live DOM inspection.
- **`public/AppIcon.png` still shows the old orange logo** — identified,
  not yet fixed (sandbox disk space ran out mid-fix). Also clean up
  `public/AppIcon.png.png` (duplicate) and `public/SplashIcon.png` (old,
  superseded) while in there.
- **Profile picture migration needs re-running** — ran once before the
  target field existed, so it almost certainly did nothing. Field now
  exists; script needs a fresh run + a spot-check before the shift-
  notification picture feature can be called fully verified.
- **`ToastNotification.tsx` calls `pb.collection(...)` directly** —
  pre-existing violation of hrData.ts's own "no direct pb.collection calls"
  rule. Not urgent, but worth fixing for consistency.
- **No sandbox build verification for most of this session's work** — the
  Claude-side sandbox ran out of disk space partway through this session
  and several fixes (timezone lock, absence system, mobile UI fixes) were
  written but never run through `npm run build:capacitor` by Claude. Always
  do a real local build before pushing anything from this history.

## 6. Absence system extended (2026-08-03, same session as this document)

Extended the no-call-no-show absence system (section 4) with inactivity
detection, an explanatory popup, and dedicated Absent Details pages. This
required re-architecting the deduction mechanism (see below) — **the
"folded into computePayrollView via a live countAbsentWeekdays recompute"
approach described in section 4 was replaced**, not layered on top of.

**New data model**: `AbsenceRecord` (hrData.ts) — one persisted record per
employee per absent date, with a specific `reason: 'no_clock_in' |
'inactivity'`, `inactivityMinutes` (when applicable), `deductionAmount`,
and an `acknowledged` flag. Stored in the generic KV store under
`hr_absence_records_v1` (no dedicated PocketBase collection — same
rationale as other KV-backed things per hrData.ts's rule 3). Record ID is
`${employeeEmail}_${date}`, naturally unique and naturally idempotent —
`runAbsenceCheck` only ever creates NEW records for a not-yet-decided
employee+date pair, so calling it repeatedly (every HR/Admin dashboard
mount) is always safe.

**Two triggers, same penalty** (2 days' pay, same multiplier as urgent
leave, per original product decision): (1) `no_clock_in` — no timesheet
shift that weekday and no approved leave; (2) `inactivity` — a shift WAS
started, but `hr_inactivity_logs` (captured by the desktop Tracker agent,
already shown in `TrackingView.tsx`'s mouse-inactivity logs) shows 35+
combined minutes of inactivity during that day's shift(s). Both share
`runAbsenceCheck(employees, timesheets, leaves, inactivityLogs)`, invoked
from both `hr/page.tsx` and `admin/page.tsx` on dashboard mount (whichever
loads first with real data "wins"; calling from both is harmless).

**Payroll integration, corrected**: `computePayrollView` no longer
recomputes absence deductions live from `countAbsentWeekdays` — that would
double-count against the persisted records once those also existed. It now
takes an `absenceRecords: AbsenceRecord[]` param and sums each employee's
current-month records' `deductionAmount` directly, so the payroll page
always shows exactly what the Absent Details page shows, no separate
recomputation to drift out of sync. `countAbsentWeekdays` itself still
exists in hrData.ts (pure, unused by payroll now) — safe to remove later if
nothing else calls it, not deleted yet in case something does.

**Employee-facing popup**: `AbsentPopup.tsx` (mounted in
`(dashboard)/layout.tsx`, employee/team_lead only, same non-Modal
non-dismissible-except-its-own-button pattern as `AnnouncementPopup.tsx`) —
shows one unacknowledged absence at a time, oldest first, with the specific
reason and the deduction amount. Acknowledging calls
`hrActions.acknowledgeAbsence`, a real server write (KV update), not a
client-only dismiss.

**Absent Details pages**: shared `AbsenceDetailsView.tsx` component, three
thin per-role page wrappers (`employee/absences`, `hr/absences`,
`admin/absences`), added to `Sidebar.tsx`'s nav for all three roles
(`UserX` icon). Employee view is filtered to their own email; HR/Admin see
every record with the employee's name. RBAC is automatic — no changes
needed to the layout's role guard, since it's purely `pathname.startsWith`-
based and these routes already sit under the right role prefix.

**Not yet done / worth a second pass**: no UI to correct/reverse a
wrongly-created AbsenceRecord (e.g. if the inactivity threshold fires on a
legitimate reason like a scheduled break or a device left unlocked during
lunch) — right now the only recourse is a manual PocketBase KV edit or
"contact HR" as the popup itself says. If false positives turn out to be
common, this needs an HR/Admin-facing "reverse this absence" action before
it can be trusted at scale. Also: sandbox build verification wasn't
possible this session (same disk-space issue as everything else) — run a
real `npm run build:capacitor` before pushing any of this.

## 7. Real-time continuous-inactivity trigger (2026-08-04)

User feedback on section 6's inactivity trigger: it was checking COMBINED
inactivity across a whole day (summing every idle log), and only detected
retroactively (whenever HR/Admin next opened their dashboard). The actual
requirement: one CONTINUOUS 35-minute idle stretch should stop the shift
and notify the employee immediately, while they're still idle — not
summed, not after-the-fact.

**Key constraint discovered mid-design**: `hr_inactivity_logs` (written by
`tracker-agent/agent_gui.py`'s `_inactivity_loop`) only gets a row once the
mouse moves again — the desktop agent uploads a *completed* idle interval,
never a "still idle right now" live signal. This means the web app
genuinely cannot detect "35 continuous minutes and counting" in real
time — that data doesn't exist server-side until the idle period ends. User
was asked and explicitly chose the correct-but-higher-risk fix: modify the
desktop agent itself (Python, `tracker-agent/agent_gui.py`) to detect the
threshold live and act immediately, rather than a lower-risk web-only
approach that would only catch it after the fact.

**Agent-side changes** (`tracker-agent/agent_gui.py`, bumped to
`APP_VERSION = "1.6"` — **remember to tag/build/release
`tracker-agent-v1.6` via the existing GitHub Actions build pipeline and
`build_windows.bat`/`build_mac.sh`, or existing installs won't get this
until they separately reinstall**):
- New `AUTO_ABSENT_INACTIVITY_SECONDS = 35 * 60`, separate from the
  pre-existing `INACTIVITY_THRESHOLD_SECONDS = 180` (3 min — that one is
  just the HR/Admin reporting threshold for what counts as a loggable idle
  stretch at all, unrelated to this feature).
- `_inactivity_loop` now has a second branch (`else`, when the mouse HASN'T
  moved) that checks elapsed idle time on every poll — not just once the
  mouse eventually moves — guarded by an `auto_absent_fired` flag so it
  fires exactly once per idle stretch (reset on mouse movement or
  shift/tracking toggling).
- `handle_inactivity_auto_absence()`: ends the shift (`auto_clock_out`,
  already existed — same function used for the "app closed mid-shift"
  case), fetches the employee's `full_name`/`base_salary` from
  `hr_profiles` (best-effort, no-auth GET — falls back to a 0 deduction
  rather than guessing wrong if this fails), creates a real `AbsenceRecord`
  directly in `hr_absence_records_v1` (same `id` shape as the web-side
  system, so it's naturally idempotent and shows up identically on Absent
  Details/Payroll regardless of which side created it), posts
  `hr_notifications` rows to HR/Admin directly (bypasses `hrActions.
  addNotification`, but `push_notifications.pb.js`'s hook still fires
  since PocketBase hooks trigger on ANY client's record creation, so
  OneSignal pushes still go out), and writes the existing
  `shift_stop_signal_<email>` KV row (`notify_shift_auto_stopped`, already
  existed) with a new `reason: "inactivity_absence"`.
- `_show_inactivity_absence_popup()`: a native Tkinter `messagebox.
  showwarning` shown via `self.root.after(0, ...)` (marshaled onto the main
  thread from the background polling thread) — this is the one
  guaranteed-to-be-seen notice, since it fires on the employee's own
  machine regardless of whether they have the web dashboard open anywhere.
- New dependency: `tzdata` (added to `tracker-agent/requirements.txt`) —
  Windows has no system IANA timezone database, so `zoneinfo` needs this
  package to resolve `America/New_York` for `_get_ny_date_string()`. Falls
  back to a fixed UTC-5 approximation if unavailable (wrong only within
  ~1 hour of a DST transition) rather than crashing.

**Web-side changes**:
- `ShiftStopSignal.reason` type now explicitly includes
  `'inactivity_absence'` (hrData.ts).
- `employee/page.tsx`'s existing 10-second shift-stop-signal poll now
  tracks which reason fired and shows different modal copy for it — a
  rose/red "Marked Absent — Shift Ended" with a link to Absent Details,
  vs. the original amber "Tracker Closed — Shift Ended" with a link to
  Tracker Setup. This is a secondary/best-effort notice (only fires if a
  browser tab happens to be open and polling) — the Tkinter popup above is
  the primary, always-fires notice.
- `runAbsenceCheck` in hrData.ts (the historical/backstop version, used by
  HR/Admin dashboards as a fallback for anything the agent's real-time path
  might miss, e.g. an employee on an unupdated agent version) was corrected
  to match: it now tracks the MAX single continuous inactivity log per
  date, not the SUM of all of that date's logs — same "one real stretch,
  not several short ones adding up" rule the agent enforces live.

**Known minor inconsistency worth double-checking**: the user's instruction
wording said the popup should mention "more than 30 mins inactivity" while
the actual configured/implemented threshold is 35 minutes throughout (both
the agent constant and the web copy). All user-facing text was written
using the real 35-minute number for factual consistency with the code
rather than the "30" figure from the instruction — flag this back to the
user if 30 was actually intended as the real threshold, since right now
code and copy agree with each other at 35 but that may not match original
intent.

**Not yet done**: this session's sandbox never had a way to actually run
Python/Tkinter, so none of the agent-side changes have been executed or
tested — read carefully and test manually (ideally on both Windows and Mac)
before tagging a release. Also worth deciding whether the packaged agent
needs a forced-update prompt (vs. the existing "check on next launch"
auto-update) given this changes real payroll-affecting behavior.

## 8. Multi-device login (max 2), employee-manageable (2026-08-04)

Replaced the old single-active-session system (Employee/Team Lead accounts
only; Admin/HR still fully exempt) with a real multi-device model, plus a
self-service "Logged-in Devices" card.

**Data model change**: the old `UserSession` KV row (one JSON object per
employee, unconditionally overwritten on every login) became
`UserSessionSlot[]` — an array of up to `MAX_USER_SESSION_DEVICES` (2) live
slots under the same KV key. Old single-object rows are read as one legacy
slot (`deviceId: 'legacy'`) for backward compatibility, so an in-flight
session from right before this shipped doesn't just vanish.

**New stable device identity**: `getOrCreateDeviceId()` in `src/lib/
session.ts` — a persisted-forever ID (localStorage + native Preferences
mirror, same durability pattern as the rest of that file) that survives
logging out and back in on the same browser/app install. This is
deliberately separate from `sessionToken` (still regenerated every login,
used to detect an actually-superseded slot) — without a stable device ID,
re-logging in on your own laptop would look like a brand-new device and
needlessly burn one of the 2 slots.

**hrData.ts functions** (replacing the old single-slot ones entirely — no
old function names remain anywhere in the codebase, confirmed via repo-wide
grep): `getUserSessions`, `isSessionSlotLive`, `claimUserSessionSlot`
(refreshes this device's existing slot if it already has one, regardless of
the cap; otherwise claims a new slot only if fewer than 2 OTHER devices are
live — returns `{ok:false, liveSessions}` naming the blocking devices if at
capacity), `touchUserSessionSlot` (the 30s heartbeat — returns false if
THIS device's specific slot is gone), `removeUserSessionDevice` (used both
by the Devices card logging out another device, and by normal logout
freeing this one), `clearAllUserSessions` (the "log out from everywhere and
sign in here" escape hatch on the login screen — still exists, now wipes
every slot instead of the one slot), `logoutSession` (now takes a
`deviceId` param).

**auth/page.tsx**: login flow calls `claimUserSessionSlot` directly (it
both checks AND claims atomically now, rather than a separate check-then-
claim as before) — if blocked, the error message now names which device
labels are occupying both slots.

**(dashboard)/layout.tsx**: the 30s periodic heartbeat now calls
`touchUserSessionSlot(email, deviceId, token)` instead of the old
`touchUserSession(email, token)` — same force-logout-on-failure behavior,
just device-aware now.

**New `LoggedInDevicesCard.tsx`**, wired into `employee/profile/page.tsx`
only (HR/Admin are exempt from the whole system and never claim a slot).
Lists every live device (label + last-active time, "This device" tag for
the current one), each with its own "Log Out" button. Logging out another
device just frees its slot (that device's own heartbeat notices within
30s and force-logs itself out). Logging out THIS device goes through the
real `hrActions.performLogout` flow first (so an open shift still gets
auto-ended, same invariant as the Sidebar/TopNav Log Out button), not just
a silent slot removal.

**Not yet done / worth flagging**: no admin-side visibility into
employees' device sessions (e.g. if someone loses access to both their
devices and can't reach the Profile page to free a slot, HR/Admin
currently has no override — they'd need to wait out `USER_SESSION_STALE_MS`
90s of the device actually being offline, which happens automatically, but
there's no manual "force-clear this person's devices" button anywhere in
the HR/Admin UI yet). Also, as with everything else this session, none of
this was build-tested (sandbox disk space issue) — run a real
`npm run build:capacitor` before pushing.

## 9. Forgot Password — self-service OTP email reset (2026-08-04)

Replaced the static "email hr@delcargo.us" Forgot Password modal on the
login screen with a real self-service flow: enter email → get a 6-digit
code by email → enter code + new password → done.

**Why this needed real research first**: this app has no email-sending
infrastructure of any kind (no SMTP config, no transactional-email
provider, no `.env`/`.env.example` before this feature) and no OTP/
verification-code concept anywhere. More importantly, `hr_profiles` is a
plain (`"type": "base"`) PocketBase collection, **not** an `"auth"`-type
one — login is a raw client-side `profile.password === password` string
comparison (see `auth/page.tsx`), so PocketBase's own built-in
password-reset-email flow was never usable here. Everything (OTP
generation/storage/expiry/verification, and the email itself) had to be
built from scratch.

**Why this lives in Next.js API routes, not a pb_hook**: this app's
dominant pattern for privileged/background logic is a `pb_hook` on the
droplet (see section 3), and that was the first design considered. It
doesn't work for the "send an email" step specifically — PocketBase's JS
hooks run in a limited script engine (goja) that can only make plain HTTP
calls (`$http.send`), not open a raw SMTP socket. The user's mailbox (a new
one to be created on their existing Namecheap Stellar hosting plan) is a
regular SMTP mailbox, not an HTTP-API email provider — so sending had to
happen from somewhere with real Node.js. That's this Next.js app, via
`nodemailer` in two new API routes (`export const runtime = 'nodejs'`,
following the one existing precedent for this in `src/app/api/pb/api/
realtime/route.ts`).

**No PocketBase admin/superuser credentials needed**: confirmed directly
in `pb_schema.json` that both `hr_profiles` and `hr_delcargo_store` have
fully open rules (`listRule`/`viewRule`/`createRule`/`updateRule`/
`deleteRule` all `""`, i.e. public) — consistent with this app's existing
"no real PocketBase auth, ever" model. So the new API routes talk to
PocketBase with plain unauthenticated `fetch()` calls directly against
`https://pb.delcargo.us`, the same way `realtime/route.ts` already does,
rather than needing a superuser/admin service account.

**New files**:
- `src/lib/serverEmail.ts` — nodemailer transporter (lazily created, cached)
  + `sendOtpEmail(to, otp)`. Reads `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/
  `SMTP_PASS`/`SMTP_FROM` from env; throws a clear error if unset rather
  than silently failing.
- `src/lib/passwordResetOtp.ts` — server-only (no `'use client'`) OTP
  generate/store/verify/consume + `findProfileByEmail`/
  `setProfilePassword`, all via direct `fetch()` against
  `https://pb.delcargo.us`. OTP records live in `hr_delcargo_store` under
  key `password_reset_<email>`: `{otp, expiresAt, attempts}`, 10-minute
  TTL, max 5 incorrect attempts before the record is invalidated and a new
  code must be requested. Deliberately NOT part of `hrData.ts` — that file
  is `'use client'` and built around the browser `pb` instance talking
  through the `/api/pb` rewrite (relative URLs that only resolve inside a
  browser); these new routes run server-side, where that rewrite doesn't
  apply.
- `src/app/api/auth/forgot-password/route.ts` — POST `{email}`. Looks up
  the profile, generates+stores an OTP, emails it. Always returns the same
  generic success message whether or not the email matched a real profile
  (this app already exposes profiles fairly openly elsewhere, so this isn't
  hiding much, but no reason to make enumeration easier from this one
  endpoint specifically).
- `src/app/api/auth/reset-password/route.ts` — POST
  `{email, otp, newPassword}`. Verifies the OTP (match + not expired +
  under attempt cap), then writes the new password straight to
  `hr_profiles.password` (same underlying write `hrActions.resetPassword`
  already does for HR/Admin — no hashing step exists to do here, matching
  how login already works) and deletes the OTP record.

**Mobile app gap found and fixed while building this**: the native
Capacitor build is a static export with no server of its own — it already
talks to PocketBase directly at a hardcoded `https://pb.delcargo.us`
specifically to dodge this problem (see `src/lib/pocketbase.ts`), but nothing
previously let it call back into this app's *own* Next.js API routes. A
relative `fetch('/api/auth/forgot-password')` would resolve to nothing
inside the native WebView. Added `src/lib/apiBase.ts` (`API_BASE`, empty
string on web, the deployed site's absolute URL on native) and used it for
both new fetch calls in `auth/page.tsx`. Production URL confirmed by the
user as `https://delcargo-io.vercel.app` (as of today) — overridable via
`NEXT_PUBLIC_SITE_URL` so a future domain move doesn't require a code
change, just rebuilding the native apps with the new env value.

**UI**: `src/app/auth/page.tsx`'s Forgot Password modal is now a 3-step
flow (`forgotStep`: `'email' | 'otp' | 'done'`) instead of a static notice —
enter email → request code; enter 6-digit code + new password + confirm →
reset; success screen. Clicking "Forgot password?" now pre-fills the
email field from whatever's already typed in the login form and resets
the flow state each time the modal opens.

**Setup still required before this works end-to-end** (none of this can
be done from here — needs the user's own Namecheap account):
1. Create the sending mailbox in Namecheap webmail/cPanel (e.g.
   `noreply@delcargo.us` — exact address still TBD as of this writing).
2. Grab that mailbox's SMTP host/port/password from cPanel → "Email
   Accounts" → "Connect Devices"/"Configure Mail Client", and set
   `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` in the
   Vercel project's environment variables (see `.env.example`).
3. Run `npm install` (adds the new `nodemailer` dependency — not yet
   installed anywhere, sandbox couldn't run it either, disk space issue
   persists).
4. As with every other feature this session: **not build-tested at all**.
   Needs a real `npm run build` (web/API routes) and `npm run
   build:capacitor` (native) before pushing, plus an actual end-to-end
   test of the email arriving and the reset working.

**Not yet built**: no rate-limiting beyond the 5-attempt/10-minute OTP cap
(e.g. nothing stops someone from spamming the forgot-password endpoint
itself to trigger repeated emails to the same address); no "resend code"
button on the OTP step (user has to go back to the email step and
re-submit to get a new code, which does work, just isn't labeled as a
resend).

## 10. Fixed: false-positive "shift ended, app was closed" on mobile (2026-08-04)

**Reported symptom**: employees (manual-start/Pakistan, non-USA — the ones
governed by the manual shift + tab-heartbeat system in section 4/24-25, not
GPS geofencing) getting randomly logged out mid-shift, with a push
notification saying their shift ended because the app was closed, even
though they hadn't closed anything — then having to start a new shift.

**Diagnosis** (flagging genuine uncertainty here — this is a strong,
well-reasoned match for the reported symptom, not something verified
against real device logs): two related mechanisms in the manual-shift
abandonment system were almost certainly firing on ordinary mobile
backgrounding, not actual app closure:

1. `SHIFT_TAB_HEARTBEAT_STALE_MS` was 2 minutes. Mobile OSes commonly
   throttle or fully suspend JS timers while an app is backgrounded — and
   simply locking the phone or briefly switching apps for a couple of
   minutes is completely normal mid-shift. Once the heartbeat (refreshed
   every 20s via `setInterval` while the tab is active) went stale,
   `closeStaleManualShiftIfAbandoned` (called once per dashboard load,
   `employee/page.tsx`) read that as "abandoned" and auto-clocked-out.
2. The `pagehide` event, used for the immediate-stop beacon
   (`beaconClockOut`), is well known to fire in mobile WebView/Safari
   contexts on simple backgrounding, not just genuine tab/app closure —
   this is exactly why an earlier fix in this same session (the
   `visibilitychange` handler at the top of `(dashboard)/layout.tsx`) had
   to be added in the first place, specifically because Page Visibility is
   the more reliable native-WebView signal. The `pagehide` handler here was
   likely doing the same misfire, ending the shift immediately every time
   the employee's phone simply went to the background.

**Fix**:
- `SHIFT_TAB_HEARTBEAT_STALE_MS` raised from 2 minutes to 15 minutes
  (`hrData.ts`) — gives real backgrounding room to breathe while still
  catching a genuinely abandoned/crashed session in a reasonable window.
- The tab-heartbeat effect (`employee/page.tsx`) now also re-touches
  immediately on `visibilitychange` -> visible, not just every 20s, so
  resuming the app doesn't have to wait out a throttled interval tick.
- The `pagehide` -> `beaconClockOut` immediate-stop effect is now gated to
  **web only** (`!isNativeMobileApp()`) — on native, only the
  loosened stale-heartbeat safety net can end an abandoned shift; on
  desktop web, closing a real browser tab is still a deliberate act, so the
  immediate beacon stays as-is there.

**Not yet done**: no live device testing (same sandbox disk-space
limitation as everything else this session) — the recommended way to
confirm this actually fixes it is to have an employee start a manual
shift, lock their phone for 3-5 minutes, and confirm the shift is still
active when they unlock. If it still auto-ends, the `pagehide` diagnosis
above may not be the (or the only) mechanism at play, and this needs
another look — possibly at OneSignal-triggered background wake behavior,
or something in the tracker-agent side for employees who also run the
desktop tracker.

**Correction (same day, before any of the above was even deployed)**: the
user clarified the affected employees were all on the **website**, not
the mobile app (mobile doesn't have Start/Stop Shift at all). So the
native-vs-web split above, while probably still a reasonable thing to
have fixed, wasn't addressing the actual population affected — see
section 11 for the real fix.

## 11. Corrected fix: disabled the pagehide instant-stop entirely (2026-08-04)

Same symptom as section 10 ("shift auto-ended" + push notification, after
an "auto page refresh"), but the affected employees are all on the
**website** (desktop browser), not the native mobile app. Section 10's
native-vs-web gating on the `pagehide` handler doesn't help this
population at all, since it left the web-side instant-stop fully active.

**Real mechanism**: Chrome/Edge's background-tab memory-saving feature
("Memory Saver" / tab discarding) silently unloads a tab that's open but
not being looked at, to free RAM — completely normal on a machine with
many tabs open, which describes most office desktop use. When the
employee switches back to that tab, the browser reloads it from scratch —
which is exactly the "auto page refresh" reported. The problem: discarding
a tab this way fires the same `pagehide` event that a genuine tab close
does, and the existing code treated `pagehide` as "the tab was closed,
end the shift right now" (`beaconClockOut` in `employee/page.tsx`). There
is no reliable way to distinguish "really closed" from "silently
discarded by the browser" using this event.

**Fix**: the `pagehide` -> `beaconClockOut` effect in `employee/page.tsx`
is now fully disabled (commented out, not deleted, with a comment
explaining why) for both web and native. Ending an abandoned manual shift
is now handled *only* by `closeStaleManualShiftIfAbandoned` (the
stale-heartbeat safety net, checked once per profile per dashboard
load) — which doesn't fire on tab discarding/backgrounding on any
platform, only on genuine prolonged silence. `SHIFT_TAB_HEARTBEAT_STALE_MS`
(15 minutes, raised in section 10) is now the single source of truth for
"how long before an abandoned shift is caught."

**Trade-off, stated plainly**: a shift that's genuinely abandoned (tab
really closed, employee really walked away) now takes up to 15 minutes to
be detected and clocked out, instead of being instant. This was a
deliberate choice — the disruption of false-positive shift-ends (an
employee's paid shift ending and requiring them to notice, explain, and
restart it) was judged worse than a bounded delay in catching a genuinely
abandoned one. Worth revisiting if 15 minutes of "still open" time turns
out to cause its own problems (e.g. payroll disputes over exact minutes),
but this is the safer default until real usage data says otherwise.

**Still not verified on real usage** (same sandbox limitation as
everything this session) — the practical test once this is pushed and
deployed: have an employee open several other tabs/apps for 10+ minutes
without touching the shift tab (long enough for Chrome to plausibly
discard it), then switch back, and confirm the shift did NOT end. Also
worth keeping an eye on whether the 15-minute reactive window feels too
slow in practice for genuinely abandoned shifts.

## 12. System Maintenance Notices (2026-08-04)

New feature: a blocking popup (+ push notification) that Admin/HR can post
before pushing an update to the website/apps, so employees actually know
the system will be briefly unavailable — the explicit trigger was the user
about to push this whole session's accumulated work to GitHub for the
first time.

**Deliberately built as a separate system from Announcement**, not an
"important announcement" variant, for two real reasons:

1. **Always targets literally everyone** (Employee, Team Lead, HR, Admin)
   — a system going down for maintenance affects every role equally,
   unlike a targeted company announcement. `MaintenanceNoticePopup` is
   mounted unconditionally in `(dashboard)/layout.tsx` (unlike
   `AnnouncementPopup`, which excludes HR/Admin — the ones posting
   announcements). HR/Admin can post maintenance notices too, but they see
   the popup just like everyone else; there's no "you posted it, you're
   exempt" carve-out here.
2. **Needs a real convertible instant, not a pre-formatted display
   string.** `hr_announcements.timestamp` is written once at creation as
   an already-NY-formatted string (`formatTimeNY(...) + ' ' +
   formatDateNY(...)`) — fine for "posted at" info, useless for "convert
   this into whatever timezone the viewer happens to be in," which is the
   entire point of this feature. So `MaintenanceNotice` (hrData.ts) stores
   real ISO UTC instants (`startAt`/`endAt`) in a new `hr_delcargo_store`
   KV key (`hr_maintenance_notices_v1`) instead of the `hr_announcements`
   collection — no PocketBase schema migration needed.

**The one deliberate exception to the NY-timezone lock**: per explicit
product decision, Admin/HR enter the maintenance window as **Pakistan
local time** (the team's own reference point), but every viewer sees it
converted to **their own device's local timezone** — the opposite of
every other timestamp in this app. `src/lib/timezone.ts` gained two new
functions for exactly this, both heavily commented as a one-off exception
so nobody mistakes them for the general pattern:
- `pktLocalToUtcIso(dateStr, timeStr)` — Pakistan Standard Time is a fixed
  UTC+5 offset year-round (no DST observed), so this is a simple,
  unconditionally-correct `Date.UTC(...)`-based conversion that doesn't
  depend on (and isn't fooled by) the Admin/HR user's own device timezone.
- `formatInViewerLocalTime(date)` — the only formatter in this file that
  deliberately passes NO explicit `timeZone` to `toLocaleString`, letting
  the browser use its own local system timezone.

**New files**:
- `src/components/ui/MaintenanceNoticePopup.tsx` — blocking popup modeled
  on `AnnouncementPopup.tsx` (same non-dismissible-except-via-its-own-
  button pattern), mounted for every role. Only shows a notice whose
  `endAt` hasn't passed yet (no point interrupting a login to announce
  maintenance that already happened).
- `src/components/ui/MaintenanceNoticeManager.tsx` — self-contained
  button + list + creation modal, dropped into both `hr/page.tsx` and
  `admin/page.tsx` with one line each (`createdBy="HR Manager"` /
  `"CEO Admin"`, matching the existing Announcement panel's convention) —
  built as one shared component specifically to avoid duplicating the
  whole form twice.

**hrData.ts additions**: `MaintenanceNotice` interface, `NotificationCategory`
gained a 6th value `'maintenance'` (explicitly excluded from
`NotificationPrefs` — unlike the other 5 categories, there's no opt-out
toggle for "the whole system is about to go down"), `useMaintenanceNotices()`
hook (15s poll — faster than `useAnnouncements`' 30s, since this should
reach people as fast as possible), `getMaintenanceNotices`/
`addMaintenanceNotice`/`deleteMaintenanceNotice`/`getMaintenanceNoticeReadMap`/
`markMaintenanceNoticeRead`/`isMaintenanceNoticeRead`.

**Correction — the pb_hook gap described above was closed the same day.**
It turned out `pb_hooks/push_notifications.pb.js` IS present in this repo
checkout — several `Glob` searches for `pb_hooks/`, `*.pb.js`, and
`push_notifications*` all came back empty (a tooling quirk, not a missing
file — `Glob` wasn't matching this path for some reason), but a direct
`Read` on the exact path worked fine. Updated it:
- `'maintenance'` added to `pushableCategories`.
- The per-recipient opt-out filter (`hr_notification_prefs_v1`) is now
  explicitly bypassed for `category === "maintenance"` — every resolved
  recipient gets the push regardless of their own notification
  preferences, matching `NotificationPrefs` deliberately having no
  opt-out toggle for this category client-side.
- `fallbackTitles` gained a `maintenance: "System Maintenance"` entry for
  when `pushTitle` isn't provided (it always is, from
  `addMaintenanceNotice`, but this matches the existing fallback pattern
  for every other category).

This file lives at `pb_hooks/push_notifications.pb.js` and deploys via
the existing `.github/workflows/deploy-pb-hooks.yml` GitHub Actions
pipeline (triggers on any push to `main` touching `pb_hooks/**`) — no
separate manual droplet step needed once this gets pushed.

## 13. CRITICAL FIX: absence check was retroactively deducting pay before go-live (2026-08-04)

**What happened**: the user ran the app locally (`npm run dev`) to test, which
loads the HR/Admin dashboard — and `runAbsenceCheck` (see section 6) runs
automatically on every HR/Admin dashboard mount, no explicit trigger
needed. Since the local dev server talks to the same real production
PocketBase (`pb.delcargo.us`, not a separate local database — see
`src/lib/pocketbase.ts`), this immediately wrote real `AbsenceRecord`s
against real employees for every already-passed weekday this calendar
month, each carrying a genuine 2-day salary deduction — reported as
employees' payroll accounts dropping "almost to 0."

**Root cause**: the day-by-day scan loop was anchored to `monthStart`
(the 1st of the current calendar month) rather than to any concept of
"the day this feature actually went live." So the very first time it ever
ran — regardless of what day of the month that happened to be — it
treated every weekday already passed this month as fair game to
retroactively judge, even though the feature had never been enforced on
any of those days.

**Fix**: added a fixed `ABSENCE_ENFORCEMENT_START_DATE` constant
(`'2026-08-04'` — today, the day this bug was caught and fixed) that the
scan loop now hard-floors against (`if (dateStr < ABSENCE_ENFORCEMENT_START_DATE) continue;`)
in addition to the existing `monthStart` bound. No date before this
constant will ever be evaluated for absence, no matter when in the month
the code runs. **If the actual push/deploy ends up happening on a later
date than 2026-08-04, update this constant to that real date before
pushing** — otherwise it'll still (correctly, but maybe earlier than
intended) start enforcing from today's date rather than whatever day it
truly goes live.

**Data already corrupted in production and NOT yet cleaned up** — this
could not be done from here (no direct PocketBase admin access in this
session). The user needs to manually fix this in the PocketBase Admin UI
(`https://pb.delcargo.us/_/`) before trusting payroll numbers again:

1. Go to Collections -> `hr_delcargo_store` -> filter by `key = "hr_absence_records_v1"`.
2. Open that one record and look at its `value` field (a JSON array of
   `AbsenceRecord` objects). Since this feature was never intentionally
   live before today, every record in there right now is bad data from
   this bug — safe to replace the whole `value` with an empty array `[]`
   (or delete the record entirely; the app treats a missing row the same
   as an empty array).
3. This alone fixes payroll — `computePayrollView` sums directly from
   these records, so clearing them restores everyone's deductions to
   normal on the next payroll page load.
4. Cosmetic follow-up, lower priority: real `hr_notifications` rows were
   also created telling HR/Admin/employees about these false absences
   (`addNotification(..., 'leave_task', ...)`, both a push and an in-app
   bell entry per bad record) — these are now misleading and could
   optionally be found/deleted in the `hr_notifications` collection
   (filter by `message ~ "was marked absent"` and a `created` date around
   whenever the bug ran), but doesn't affect any real payroll numbers.

**Lesson for future features that write to production-shaped data**: any
new "runs automatically on dashboard mount" check needs to be designed
from the start with an explicit go-live floor, not an implicit one like
"start of the month" — and more generally, local dev testing against a
shared production PocketBase instance is inherently risky for any
write-triggering code path; there's no environment separation here to
catch this class of bug before it reaches real data.

**Not yet done**: no live testing (same sandbox/no-`npm install` limitation
as this entire session) — once pushed, test that: (a) the popup actually
shows to a second browser/account within ~15s of posting, (b) the
displayed time genuinely differs correctly between two devices set to
different timezones, (c) the in-app bell shows the maintenance
notification, and (d) once the `pb_hooks` gap above is closed, that a real
push arrives on a phone with the app closed.
