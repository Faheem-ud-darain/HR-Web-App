# DelCargo HR — Handoff Notes (Screen Tracking Feature + Related Fixes)

For any agent picking up work on this repo (`SPARXzeux/HR-Web-App`) after this session. Read this before touching tracking-related code, `db.ts`, or the tracker-agent desktop app.

## App context (unchanged, still true)

Next.js + Supabase HR portal for DelCargo Logistics. No API routes — all data access is direct client-side Supabase calls via `@supabase/supabase-js`. **RLS is disabled on every table, deliberately, because the app is in a testing phase** — the user has repeated this instruction multiple times: do not enable RLS, add Supabase Auth, or otherwise touch database security/schema without an explicit go-ahead. When new features need new state, the established pattern is to use the generic `delcargo_store` key-value table (`{key, value}` rows) instead of asking the user to run schema migrations.

## 1. Screen Tracking feature (built this session, end to end)

**What it does:** Lets HR/Admin authorize periodic desktop screenshots for specific remote employees, view/export them, and auto-delete old ones monthly with a warning. Screenshot capture cannot happen from a browser tab alone, so it required a real desktop agent.

**Web side (`src/lib/db.ts`, `src/components/ui/TrackingView.tsx`, `src/app/(dashboard)/{hr,admin}/tracking/page.tsx`, `src/app/(dashboard)/employee/tracker/page.tsx`):**
- `TrackingSettings` — one row per employee (`enabled`, `intervalMinutes`, `excludeFromAutoDelete`, `agentToken`), stored in KV key `hr_tracking_settings_prod_v1` as a single array.
- `Screenshot` — each capture is its **own individual KV row** (`key: screenshot_<id>`), deliberately not one shared array, so concurrent uploads from multiple employees' agents never race.
- `TrackerHeartbeat` — live "is the desktop app actually connected" status, one KV row per employee (`key: tracker_heartbeat_<slug>`), written only by the desktop agent, read-only from the web app. Drives the Connected/Not Connected badges.
- Monthly retention sweep (`checkScreenshotRetention`): warns first, deletes after a grace period, honors an exclude list.
- HR/Admin Screen Tracking page: per-employee toggle/interval/exclude, Setup Agent modal (generates a one-time setup code), Screenshot viewer with week/month export to ZIP, and now a "Device" column showing live connection status.
- Employee-facing self-service (Shift Tracker page): employees can now generate their **own** setup code and download the app without asking HR/Admin — scoped strictly to their own email, never anyone else's.
- **Screen tracking is wired to the manual Start Shift / End Shift buttons** (`employee/page.tsx`): starting a shift sets `enabled: true`, ending it sets `enabled: false`. This is intentional design (explicitly requested), not a bug — if you see a report like "tracking toggle turned off after End Shift," that's correct behavior, not a regression.

**Desktop side (`tracker-agent/agent_gui.py`):**
- A packaged Python/Tkinter GUI app (not the old headless `public/delcargo_tracker_agent.py`, which is kept only as an "advanced" fallback). Built into a standalone `.exe`/`.app` via PyInstaller — employees never install Python.
- Setup flow: paste a one-time setup code (base64 of `{u: supabaseUrl, k: anonKey, t: agentToken}` — see `encode_setup_code`/`decode_setup_code`, must stay in sync with `src/lib/trackerSetup.ts`'s `encodeSetupCode`). Before connecting, it shows the resolved employee email and requires explicit "Is this you?" confirmation (RBAC safeguard against pasting a coworker's code).
- System tray/menu-bar icon (`pystray`) — closing the window (✕) minimizes to tray, it does **not** quit. A one-time notification tells the user where to find it again (OS-specific: Windows system tray vs. Mac menu bar).
- "Start automatically when I log in" — Windows Registry Run key / macOS LaunchAgent.
- **Single-device enforcement:** each install has its own persistent `device_id`. Connecting claims the account's heartbeat row outright (overwrites any previous device). Any other device polling that row notices the mismatch within ~60s, shows "Connected elsewhere," and stops capturing — this is how switching PCs auto-disconnects the old one.
- "Use a Different Setup Code" button on the dashboard lets someone reconnect (new code, or take back a superseded device) without a full Disconnect. Each worker thread is started with its own `cfg`/`stop_event` snapshot (passed as explicit args, not read live off `self`) specifically so an old thread can never keep running stale credentials after switching codes — this was a real bug caught and fixed mid-session, keep this pattern if you touch `_worker_loop`/`_start_worker`.
- **CI build/release:** `.github/workflows/build-tracker-agent.yml` builds Windows + Mac natively (PyInstaller can't cross-compile) on `windows-latest`/`macos-latest` runners, triggered by pushing a tag matching `tracker-agent-v*`. Requires `contents: write` permission on the release job (repo's Settings → Actions → Workflow permissions must also be "Read and write" — this bit HR once already, "Resource not accessible by integration" means check that setting first).
- **Tag numbers are sequential and must be unique** — currently at `tracker-agent-v5`. Don't reuse an old tag number; `git push` will silently no-op ("Everything up-to-date") if the tag already exists remotely.

**RBAC model — be honest about its limits:** Every settings function is scoped by the `email` argument the caller passes, and the desktop agent always gets its `employeeEmail` from the server-side settings row matched by token (never from anything it declares itself) — this prevents *accidental* misuse (wrong code pasted, stale cache, etc.), not deliberate tampering. There is no real auth server; a technically-inclined user could still call these functions from devtools with someone else's email. Don't claim this is a security boundary in any documentation or to the client — it isn't, until Supabase RLS/Auth is turned on (deferred, see above).

## 2. Bug patterns fixed this session — don't reintroduce these

- **Case-insensitive email matching:** `localStorage.user_email` is always lowercased at login, but `Profile.email` / `TimesheetEntry.employeeEmail` / `Ticket.employeeEmail` can carry whatever casing HR typed during onboarding. Any exact `===` comparison between these silently fails to match. Fixed in 13+ files this session. **Always compare with `.toLowerCase()` on both sides** when matching against a stored email.
- **Stale local-cache read-modify-write races:** `getInitialData()` reads from `localStorage`, not live Supabase. Functions that do read-modify-write on a whole KV array (like `updateTrackingSettings`) must fetch fresh from Supabase first (see `getTrackingSettingsFresh` in `db.ts` for the pattern), or a tab with a stale cache can silently drop/duplicate data written elsewhere. Apply this pattern to any new KV-array read-modify-write function.
- **Fire-and-forget async writes:** many `db.ts` functions used to call Supabase saves without `await`. All fixed, but if you add a new `db.ts` write function, make sure the whole call chain is `async`/`await`ed.
- **Tkinter gotcha:** widget **constructors** (`tk.Label(..., pady=(0,14))`) do NOT accept tuple padding — only `.pack(pady=(0,14))` does. Passing a tuple to a constructor option throws `_tkinter.TclError: bad screen distance`. Just fixed one instance; if you add new Tkinter widgets in `agent_gui.py`, keep `padx`/`pady` tuples on `.pack()`/`.grid()` only.

## 3. Notifications

Added a "Clear All" button to the notification bell (`TopNav.tsx`), available to every role. Implemented as a **per-user dismissal marker** (`NotificationClearedMap`, KV key `hr_notification_cleared_prod_v1`) — mirrors the existing per-user read-map pattern (`isNotificationRead`/`markNotificationsAsRead`). Clearing never deletes the underlying notification or affects other recipients of a broadcast (`recipientEmail === 'all'`).

## 4. Things NOT done / explicitly deferred

- ~~Real Supabase Storage bucket for screenshots/documents — currently base64-in-Postgres via `delcargo_store`, fine for free-tier small-scale testing, should move before scaling up.~~ **DONE, and superseded** — the app moved off Supabase to PocketBase, screenshots moved to real PocketBase file-field records, and PocketBase's own file storage is now configured for DigitalOcean Spaces (S3-compatible), confirmed live in the Admin UI on 2026-08-18. See `PROJECT_HISTORY.md` section 1a. (Base64 blobs for CVs/passports/identity docs in `hr_delcargo_store` are a separate, still-open item — also covered in that section.)
- Code signing for the desktop app — currently unsigned, so Windows SmartScreen / macOS Gatekeeper show "unknown publisher" warnings on first run.
- RLS / Supabase Auth / real RBAC enforcement — explicitly deferred until the user says they're moving to deployment phase. Do not enable without asking first.
- "Push bank details self-service feature" — was on an earlier task list, status unclear, not raised recently. Don't resume without confirming with the user.

## 5. Instructions for staying on path

1. **Never touch the database schema or RLS settings** without the user explicitly saying they're ready for deployment phase. Default to the `delcargo_store` KV pattern for any new persisted state.
2. **Always use case-insensitive email comparisons** anywhere you match against a stored email.
3. **Fetch fresh from Supabase before any read-modify-write on a shared KV array** — don't trust `getInitialData`'s local cache for that.
4. **This environment usually has no working build sandbox** (`mcp__workspace__bash` frequently reports "Workspace unavailable — not enough disk space"). Verify changes by careful manual `Read` review of JSX/brace balance and logic, not by assuming `tsc`/`next build` ran. Flag this limitation to the user rather than claiming a build passed.
5. **Desktop agent releases go through git tags**, not manual file uploads: `git tag tracker-agent-vN && git push origin tracker-agent-vN` where N is the next unused number (currently 5). Check `https://github.com/SPARXzeux/HR-Web-App/releases` for the last-used number first.
6. **Give the user copy-pasteable git commands** after every change instead of trying to run git yourself — there's no working shell in this environment either; the user runs commands locally and reports back.
7. When something looks like a "bug" but is actually a previously-requested design decision (e.g., shift buttons controlling the tracking toggle), say so plainly instead of "fixing" intended behavior.
8. Keep `tracker-agent/agent_gui.py`'s `encode_setup_code`/`decode_setup_code` in sync with `src/lib/trackerSetup.ts` if the setup-code format ever changes — both sides must agree on the JSON shape (`{u, k, t}`) and base64url encoding.
