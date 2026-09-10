# 012 — Lock down PocketBase's public data exposure

- **Status**: TODO
- **Commit**: (none yet — planning only)
- **Severity**: CRITICAL
- **Category**: Security (not part of the animation audit — tracked here for the same reason plans 007-011 are)
- **Estimated scope**: large. Formalizes and sequences the existing draft at `Claude outputs/pocketbase-security-remediation-plan.md` (2026-09-07) into this repo's plan format. Touches ~15-20 PocketBase collections' access rules, requires a new API route per sensitive collection/use-case, and requires updating every frontend call site that currently reads that collection directly via `pb.collection(...)`.

## Problem

Every `hr_*` collection in PocketBase (`pb.delcargo.us`) currently has its
List/View rules — and in most cases Create/Update/Delete — set to fully
public. Anyone on the internet, with no login at all, can read (and in most
cases create, edit, or delete) every employee's payroll, timesheets,
screenshots, tracking settings, support tickets, team chat messages, and
notifications, simply by calling the PocketBase REST API directly. This
isn't one misconfigured collection — it's essentially every collection
except `users`, `warehouse`, `packages`, and `login_history`.

Root cause: the app's browser code talks to PocketBase directly
(`pb.collection('hr_timesheets').getFullList()`, etc.) and never logs into
PocketBase's own auth system. Login instead goes through this app's own
custom JWT (`src/lib/serverAuth.ts`), checked only by the Next.js server.
PocketBase itself has no idea who's making a request — every request from
the browser arrives looking anonymous. Given that, the only rule that
didn't break the app for Admin/HR/employees alike was "public," so that's
what got set, collection-wide, at some point in this app's history.

Why it can't be fixed by just editing rules: PocketBase's rule engine can
only restrict access based on `@request.auth` (a PocketBase-recognized
login) or static conditions. Since nothing in this app produces a
PocketBase-recognized login, any rule stricter than "public" — even "must
be logged in" — blocks Admin and HR exactly as much as it blocks a
stranger. Flipping rules today, with no other changes, takes the whole app
down for everyone.

## Target

For each sensitive collection: the browser stops talking to PocketBase
directly for that collection's data. Instead it calls a Next.js API route,
which verifies the caller's real session via `requireSession()`
(`src/lib/serverAuth.ts`), then uses the existing server-only PocketBase
superuser client (`src/lib/pbAdmin.ts`) to fetch/write exactly what that
person's role is allowed to see. Only once every frontend call site for
that collection has been migrated does that collection's PocketBase rule
get locked down (List/View/Create/Update/Delete restricted to admin-only,
or removed entirely where nothing legitimate needs public access).

The template already exists and already works in production:
`src/app/api/payroll/me/route.ts` + `src/app/api/admin/payroll/route.ts`.
Every other collection in the table below follows this same shape.

One deliberate exception: the desktop tracker agent
(`tracker-agent/agent_gui.py`, `public/delcargo_tracker_agent.py`) is not a
browser session and has no app JWT — it authenticates only by holding a
per-employee `agentToken`. For the collections it touches (heartbeats,
screenshot creation, tracking-settings lookups), the fix is a PocketBase
rule that checks the request's own `agentToken` against the matching
employee's row (e.g. a create rule requiring the submitted token to match
that employee's stored `agentToken`), not a Next.js API migration.

## Repo conventions to follow

- New API routes live under `src/app/api/<domain>/...`, matching the
  existing `payroll/me`, `admin/payroll`, `absences/me` naming pattern —
  `<domain>/me` for "my own data," `admin/<domain>` for HR/Admin full-list
  views.
- Every route starts with `requireSession(request)` and an explicit role
  check (`['admin','hr'].includes(session.role)` or equivalent) before
  touching `pbAdmin.ts` — copy the exact pattern from
  `src/app/api/admin/payroll/route.ts`.
- Use the functions already exported from `src/lib/pbAdmin.ts`
  (`adminListX`, `adminGetX`, `adminDeleteRecords`, etc.) rather than
  constructing raw PocketBase admin calls inline; add new `adminX`
  functions to that file following its existing naming/shape when a
  collection has no helper yet.
- Never import `pbAdmin.ts` from a `'use client'` file — it holds real
  PocketBase superuser credentials server-side only (see its own top-of-
  file comment).
- After migrating a collection's frontend call sites, verify with a live
  test as each affected role (Admin/HR/Employee/Team Lead as applicable)
  *before* touching that collection's PocketBase rule — locking a rule
  before the app has stopped depending on public access breaks that
  feature immediately in production, with no easy rollback path from the
  PocketBase Admin UI alone.
- Written for PocketBase's pre-v0.23 admin auth endpoint
  (`/api/admins/...`) per `pbAdmin.ts`'s own comment — if PocketBase gets
  upgraded past v0.23 first, check that comment and
  https://pocketbase.io/v023upgrade before assuming this plan's routes
  still authenticate the same way.

## Steps

Phased order, matching the original audit's recommendation (highest
exposure / most sensitive data first):

1. **Phase 1 — highest exposure**: `hr_screenshots` (employee monitoring
   images — route employee-facing reads through an API scoped to their own
   screenshots, Admin/HR full-list through an admin-checked API; agent's
   Create stays public but gated by an `agentToken` rule), `hr_payroll`
   (finish the existing partial migration — extend to HR/Admin's full-list
   view, then lock List/View/Delete to admin-only), `hr_career_applications`
   (applicant PII — full lockdown, `hr_careers` job listings can likely
   stay public read-only), `hr_tracking_settings` / `hr_delcargo_store`
   (agent tokens themselves are currently publicly readable — needs the
   agentToken-based rule plus an API route for the Admin/HR Tracking page).
2. **Phase 2**: `hr_timesheets` (clock in/out data — route employee's own
   reads/writes and Admin/HR's full views through API routes), `hr_profiles`
   (names, emails, salaries, roles — route "my profile" and "team roster"
   reads through role-scoped API routes), `hr_tickets` (support ticket
   contents, can include personal complaints — scope by own tickets /
   HR-department visibility), `hr_messages` (team chat — scope by
   conversation participants; this is the most sensitive item in this
   phase).
3. **Phase 3**: `hr_notifications` (route through an API scoped to "my
   notifications"), `hr_leaves` (scope by own leaves / Admin-HR full view),
   `hr_absence_records` (same pattern as payroll — pair with that
   migration), `hr_inactivity_logs`.
4. **Phase 4 — lower individual sensitivity, still needs write lockdown**:
   `hr_tasks`, `hr_announcements`, `hr_teams`, `hr_warehouses` (currently
   anyone can post fake announcements or edit team/warehouse structures —
   at minimum lock Create/Update/Delete to admin-only even before any read
   migration), `hr_team_documents`, `hr_app_releases` (review whether these
   should stay public-read — e.g. app release files may legitimately need
   to — but Create/Update/Delete should not be public), `hr_ticket_presence`
   (low sensitivity, Create/Update/Delete lockdown only).
5. For each collection in each phase: build the route(s) → update every
   frontend call site → test live as every affected role → only then edit
   that collection's PocketBase rule. Do not batch rule changes ahead of
   their corresponding frontend migration.
6. After all phases: re-run the same collection inventory (List/View/
   Create/Update/Delete per collection) and confirm nothing outside
   `users`/`warehouse`/`packages`/`login_history` is still fully public
   except the deliberate exceptions called out above (agent-token-gated
   collections, intentionally-public job listings).

## Boundaries

- Do NOT lock any PocketBase rule before its collection's frontend call
  sites have been migrated and tested live as every affected role — this
  is the exact mistake that would take the app down for everyone.
- Do NOT invent a second superuser/admin client — extend `pbAdmin.ts`.
- Do NOT change the tracker agent's authentication model beyond adding the
  agentToken-based PocketBase rules described above; it must keep working
  without an app JWT.
- Do NOT do all ~20 collections in one PR — phase per Steps, so a mistake
  in one phase doesn't block or get tangled with the others, and so
  production can be verified safe after each phase rather than only at
  the very end.
- Do NOT touch plans 001-011's own work.

## Verification

- **Mechanical**: `npx tsc --noEmit -p tsconfig.json` clean after every
  phase.
- **Manual, per phase**: test the migrated feature live as every affected
  role (Admin, HR, Team Lead, Employee) before locking that phase's
  PocketBase rules.
- **Manual, per phase, post-lock**: attempt an unauthenticated raw
  PocketBase REST call (e.g. `curl` to
  `https://pb.delcargo.us/api/collections/hr_screenshots/records`) against
  each newly-locked collection and confirm it now returns 403/401 instead
  of real data.
- **Done when**: every collection in the inventory above is no longer
  fully public except the deliberate agent-token-gated and
  intentionally-public exceptions, and every legitimate feature that used
  to depend on that public access still works end-to-end through its new
  API route.

## Implementation note (in progress)

**`hr_career_applications` — DONE (2026-09-10).** First collection migrated
and locked, as a small, low-risk slice to prove the pattern before tackling
the larger Phase 1 items (screenshots, payroll, tracking settings):

- Added `adminListCareerApplications` / `adminHasAppliedForPosition` /
  `adminCreateCareerApplication` / `adminUpdateCareerApplicationStatus` to
  `src/lib/pbAdmin.ts`.
- New route `src/app/api/careers/apply` (public, no session — job
  applicants have no app account) handles the duplicate-application check
  and the write.
- New route `src/app/api/admin/careers/applications` (HR/Admin
  `requireSession()`-gated) handles the list read and status updates.
- `CareersView.tsx` now calls these routes (via new `hrData.ts` helpers
  `submitCareerApplicationPublic` / `getCareerApplicationsAdmin` /
  `updateApplicationStatusAdmin`) instead of talking to PocketBase
  directly; the old `hasAppliedForPosition` / `submitCareerApplication` /
  `updateApplicationStatus` / `useCareerApplications` were removed.
- Live-tested end-to-end against the real production PocketBase (not a
  staging copy — this app's `localhost` dev server points at the live
  `pb.delcargo.us` database) using clearly-labeled, then deleted, test
  records: submitted an application as an anonymous public candidate,
  confirmed it appeared correctly in the HR/Admin Applications panel,
  changed its status, then re-tested the same two flows again *after*
  locking the collection's PocketBase rules to confirm nothing broke.
- One real bug caught and fixed during live testing: the first version of
  the two new client-side calls used a plain `fetch()` with no
  `Authorization` header, so the HR/Admin route 401'd. This app's session
  isn't a cookie — every authenticated client call has to carry
  `Authorization: Bearer <getAuthToken()>` (see `usePayrollSelf` /
  `upsertPayrollRecordAdmin` in `hrData.ts` for the established pattern).
  Fixed by routing through proper `hrData.ts` helpers using that same
  pattern instead of raw `fetch()` calls in the component.
- `hr_career_applications`'s List/View/Create/Update/Delete rules are now
  all "Admins only" in PocketBase — confirmed via a live unauthenticated
  `fetch` to the raw PocketBase REST endpoint returning
  `403 Only admins can perform this action` post-lock.
- `hr_careers` (the job *listings*, as opposed to applications) was left
  untouched and still public-read, per this plan's own Target — anyone
  visiting `/careers` with no account still needs to see open positions.
- **Regression caught and fixed the same day**: two other, unrelated
  HR/Admin features — `exportEmployeeArchive`'s "Download Archive" action
  and `deleteEmployee`'s permanent-delete purge flow — independently read
  and deleted `hr_career_applications` via the old public client, outside
  the scope originally reviewed for this slice. Both broke silently once
  the collection was locked. Caught by grepping `hrData.ts` for every other
  reference to the collection name right after locking, before it could
  surface as a live bug. Fixed with `adminListCareerApplicationsForEmail` /
  `adminDeleteCareerApplicationsForEmail` (`pbAdmin.ts`), `?email=` support
  on the existing GET route plus a new DELETE handler, and matching
  `hrData.ts` helpers. Live-verified: the GET path returns a real
  applicant's actual data by email; the DELETE path is a safe no-op against
  a nonexistent email. **Lesson carried into every later slice below**:
  before/after locking any collection, grep the whole file for every other
  call site of that exact collection name, not just the one originally in
  scope.

**`hr_payroll` — DONE (2026-09-10).** Extended the existing partial
migration (the "Process Payroll" / "Release Monthly Funds" write, already
authenticated) to cover the full-list read path too:

- `src/app/api/admin/payroll/route.ts` gained a `GET` and a `DELETE`
  alongside its existing `POST`. `GET` is scope-aware from the verified
  session, not anything the client claims: `?employeeId=<id>` is HR/Admin
  only (one employee's rows, for `exportEmployeeArchive`); no param and
  HR/Admin gets the full company-wide list (unchanged behavior for
  `admin/payroll`, `hr/payroll`, the admin dashboard, and `admin/insights`
  — all already role-gated pages); no param and any other role gets ONLY
  their own records — needed because `TopNav`'s global search bar calls
  the underlying hook unconditionally for every role, and used to fetch
  everyone's payroll into every employee's browser to do that. `DELETE`
  (`?employeeId=`, HR/Admin only) purges one employee's rows, for
  `deleteEmployee`'s purge flow.
- `pbAdmin.ts` gained `adminDeletePayrollForEmployee`; the full-list and
  per-employee list helpers (`adminListAllPayroll`, `adminListPayrollForEmployee`)
  already existed from an earlier, unfinished pass.
- `hrData.ts`'s `usePayroll()` hook keeps its exact name, shape, and
  `useQuery` key — only its internals changed, from a public
  `pb.collection('hr_payroll').getFullList()` call to an authenticated
  fetch of the route above. This meant its 5 existing callers
  (`admin/payroll`, `hr/payroll`, the admin dashboard, `admin/insights`,
  and `TopNav`) needed zero code changes. Added `getPayrollForEmployeeAdmin`
  / `deletePayrollForEmployeeAdmin` for the two remaining direct-client call
  sites (`exportEmployeeArchive`, `deleteEmployee`'s purge), matching the
  same pattern used for career applications.
- Removed dead code: the old public-write `hrActions.upsertPayrollRecord`
  (zero remaining callers, superseded by the already-authenticated
  `upsertPayrollRecordAdmin`/`/api/admin/payroll` POST) and the now-unused
  `toPayroll` raw-record mapper.
- Live-tested as HR (full ledger loads correctly on `hr/payroll`; `TopNav`
  search now correctly returns "Payroll (2)" style scoped matches) and as
  a real employee (`faheem@delcargo.us`, with the user's permission) —
  confirmed their Salary page is unaffected (it already went through
  `/api/payroll/me`) and that `TopNav` search now returns only *their own*
  payroll record, with "No matching results found" for another employee's
  name — the exact leak this migration closes.
- `hr_payroll`'s List/View/Delete rules are now "Admins only" in
  PocketBase (Create/Update were already effectively admin-only in
  practice via the existing POST route, and are locked here too for
  consistency) — confirmed via a live unauthenticated `fetch` to the raw
  PocketBase REST endpoint returning 403 post-lock.

**`hr_screenshots` — MOSTLY DONE, one deliberate gap remains.** Turned out
to already be substantially migrated from an earlier (2026-09-07) pass, not
started fresh this session:

- List/View/Update/Delete rules were already "Admins only" in PocketBase.
- `GET /api/tracking/screenshots` (role-scoped: admin/hr see anyone,
  team_lead only their own team, via `adminListScreenshots` in
  `pbAdmin.ts`) and `POST /api/tracking/screenshots-retention` (the
  monthly warn-then-delete sweep, via `adminDeleteRecords`) already existed
  and already replaced the client-side public-client calls in `hrData.ts`
  (`getScreenshots`, `checkScreenshotRetention`).
- Only the **Create** rule was still fully public (empty rule = anyone,
  not even token-gated) — this is deliberate per this plan's own Target
  ("agent's Create stays public but gated by an `agentToken` rule"), since
  the desktop/Chromebook tracker agents write directly to PocketBase's
  REST API with no app session at all.
- **Investigated locking Create with an `agentToken` match against
  `hr_tracking_settings` (`@collection.hr_tracking_settings.employeeEmail
  = @request.body.employee_email && @collection.hr_tracking_settings.agentToken
  = @request.body.agent_token`), but did NOT apply it**: the Python
  desktop agent (`agent_gui.py` / `delcargo_tracker_agent.py`) already
  sends `agent_token` on every upload, but the Chromebook/Chrome-extension
  tracker (`chrome-extension/background.js`, `captureAndUploadScreenshot`)
  does not send `agent_token` at all today — gating Create now would
  immediately break screenshot capture for every Chromebook/Chrome-extension
  employee, with no way to verify a fix live in this session (rolling out
  a new extension version and confirming employees pick it up isn't
  something this session can do end-to-end). Explicit product decision:
  left Create public for now rather than break live tracking.
- `deleteScreenshots` (used only by `deleteEmployee`'s purge flow) is
  still on the public client — pre-existing, silently-broken already
  today, since Update/Delete were locked in the earlier pass without this
  call site being migrated. Documented in `/api/admin/profile/route.ts`'s
  own standing note as deliberately deferred (`deleteEmployee` and
  `exportEmployeeArchive` are large, multi-collection actions that need
  their own careful pass, not a rushed fix here) — left as-is rather than
  scope-creeping this slice further.
- **Follow-up needed before Create can be locked**: update
  `chrome-extension/background.js` to send `agent_token` (reading it the
  same way the desktop agent does, from its own setup-code-derived
  config), ship/roll out that extension version, confirm employees are on
  it, *then* apply the Create rule above and re-verify screenshot capture
  end-to-end on both Windows/Mac (desktop agent) and Chromebook (extension)
  before/after the lock.

**`hr_delcargo_store` investigation + one urgent fix (2026-09-10).** User
asked whether this KV collection was even still used, on the theory that
"everything has its own collection now." Investigated exhaustively (every
call site of `pbGetKV`/`pbSetKV`/`pbGetKVByPrefix`/`pbDeleteKVByKeys` in
`hrData.ts`, their `pbAdmin.ts` admin-token mirrors, and every direct
reference to `hr_delcargo_store` across the whole repo including
`chrome-extension/` and `tracker-agent/`): it is NOT retired — roughly 20
distinct key/prefix patterns and 100+ call sites are still genuinely live
(profile overlay data, notification read-state, the entire tracker-agent
heartbeat/ping/pong protocol, session tracking, password-reset OTPs,
Google OAuth tokens). Only the legacy `screenshot_<id>` prefix is truly
dead, superseded by the real `hr_screenshots` collection. Full findings
kept for reference in this implementation note rather than repeated here.

Of everything found, one was a genuinely severe, standalone bug worth
fixing immediately rather than folding into the larger deferred
`hr_delcargo_store` lockdown:

- **`src/app/api/auth/google/callback/route.ts` was writing employees'
  Google OAuth access/refresh tokens straight to `hr_delcargo_store` via a
  raw, unauthenticated `fetch()`** — not even through `pbAdmin.ts`. With
  the collection still fully public, anyone could already read (or
  overwrite) any employee's Google tokens directly off the PocketBase REST
  API. Fixed: the route now writes via `adminSetKV` (server-only admin
  token), same as everywhere else in this codebase.
- **`GoogleIntegrationCard.tsx` was also fetching the entire KV value —
  including the raw tokens — into browser state**, just to show a
  connection badge and three toggle switches; nothing in the app actually
  consumes those tokens today (Calendar/Meet integration is still just
  public `meet.google.com`/`calendar.google.com` template links, see
  `ScheduleMeetModal.tsx`, not an authenticated Google API call). Fixed
  with a new self-scoped route (`src/app/api/google/integration`, GET/POST/
  DELETE) that never returns the `tokens` field at all — only
  `connectedEmail`/`connectedAt`/the three boolean toggles. The card now
  calls this route instead of the old `hrActions.getKV`/`setKV`/`deleteKV`.
  `deleteKV` itself is now dead code (only caller was this card) and was
  removed; `getKV`/`setKV` are kept — `employee/profile/page.tsx`'s
  account-deletion-request flow still legitimately uses them.
- Live-verified: no employee has actually connected a Google account yet
  in production (confirmed via a PocketBase filter search — zero
  `google_integration_*` rows exist), so there was no live token data
  actually exposed by this bug yet; the fix is in ahead of anyone using
  the feature. Verified the new route returns `{data: null}` correctly
  for a not-yet-connected employee (`faheem@delcargo.us`, live).
- **Not done**: `hr_delcargo_store`'s PocketBase rules are still fully
  public — this fix only closed the two worst code-level holes (the
  unauthenticated write, and the client-side token overexposure). Locking
  the collection itself needs the full migration described above, plus
  updating the chrome-extension/tracker-agent binaries that also hit it
  directly and unauthenticated (same class of problem as
  `hr_screenshots`' Create rule) — still deferred as its own future plan.
- `hr_tracking_settings` also remains fully public on all four rules
  (List/Search/View/Create/Update) — every employee's `agentToken` is
  currently readable in plain text. The correct List/View fix (an
  agentToken-based rule, since the desktop tracker's
  `get_tracking_settings()` reads its own row directly with no app
  session) needs care to get the PocketBase filter-rule syntax right
  without breaking the already-deployed tracker binary — investigated but
  not yet implemented.

Remaining in Phase 1: `hr_tracking_settings` (rules still fully public),
the broader `hr_delcargo_store` lockdown (its own larger, separate
project per the investigation above).

## hr_delcargo_store -> dedicated collections migration (in progress)

Per explicit direction: instead of just auth-wrapping `hr_delcargo_store`,
split its live concerns into their own properly-schema'd PocketBase
collections (same pattern already used for `hr_screenshots`,
`hr_ticket_presence`, `hr_tracking_settings`) — for both security (precise
per-collection rules instead of one shared public table) and performance
(PocketBase doesn't have to load/rewrite a giant shared JSON blob for one
employee's action).

**Step 1 (done, schema-only — no code changed yet, zero effect on
currently-working employees):** created 17 new collections in production
PocketBase, all four rules (`list/view/createRule` + `deleteRule`) set to
`null` (admin-only / inert until wired up), so they sit alongside
`hr_delcargo_store` unused:

- `hr_google_integration` (email, connected_email, connected_at, tokens,
  sync_calendar, use_for_2fa, use_for_password_reset) — formalizes the
  already-fixed Google OAuth flow into its own table instead of
  `hr_delcargo_store`'s `google_integration_<email>` key.
- `hr_profile_extra` (profile_id, data) — replaces `hr_profile_extra_<id>`.
- `hr_profile_docs` (profile_id, data) — replaces `hr_profile_docs_<id>`.
- `hr_notification_reads` (email, read_ids) / `hr_notification_cleared`
  (email, cleared_ids) / `hr_notification_prefs` (email, prefs) — replace
  `hr_notification_reads_prod_v1` / `_cleared_prod_v1` / `_prefs_v1`, each
  of which today is ONE giant `Record<email, ...>` blob rewritten in full
  on every single employee's read/toggle. Splitting to one row per email
  removes both the full-table-load and the write-clobbering risk between
  concurrent employees.
- `hr_announcement_reads` (email, read_ids) — replaces
  `hr_announcement_reads_v1` (same single-blob-for-everyone issue as
  above).
- `hr_message_reads` (email, read_ids) — replaces `hr_message_reads_v1`
  (same issue).
- `hr_ticket_closed_state` (ticket_id, closed_at) — replaces
  `hr_ticket_closed_at_v1` (currently one blob keyed by ticket id for
  every ticket in the system).
- `hr_typing_indicators` (scope, scope_id, email, updated_at; unique on
  the triple) — replaces the `hr_typing_${scope}_${scopeId}_${email}` KV
  key-per-row pattern (chat + ticket typing indicators).
- `hr_deleted_profiles` (email, deleted_at) — replaces
  `hr_deleted_profile_emails_v1`, currently a single JSON array blob.
- `hr_tracker_signals` (email, heartbeat, ping_at, pong_at, quit_intent,
  stop_cmd, command, diagnostics, shift_stop_signal,
  shift_tab_heartbeat) — replaces the `tracker_heartbeat_/tracker_ping_/
  tracker_pong_/tracker_stop_cmd_/tracker_command_/tracker_diagnostics_/
  shift_stop_signal_/shiftTabHeartbeat_<email>` key family. **Flagged as
  the highest-risk migration**: the already-deployed Chrome extension and
  desktop tracker agent binary write/read these keys directly against
  `hr_delcargo_store`'s public REST endpoint, unauthenticated — migrating
  the app's own code off these keys is safe, but the collection can't be
  locked down (and the old keys can't be removed from `hr_delcargo_store`)
  until those two clients are updated and rolled out to every employee's
  machine, which can't be verified end-to-end from this session.
- `hr_user_sessions` (email, data, updated_at) — replaces
  `userSession_<email>`.
- `hr_account_deletion_requests` (email, requested_at, data) — replaces
  `account_deletion_request_<email>`.
- `hr_password_resets` (email, token, expires_at) — replaces
  `password_reset_<email>`.
- `hr_otp_ratelimit` (email, data) — replaces `otp_ratelimit_<email>`.
- `hr_screenshot_retention_state` (key, data) — replaces
  `hr_screenshot_retention_state_v1`.

Not migrated to a dedicated collection (already done, or intentionally
left as-is): `hr_ticket_presence` and `hr_tracking_settings` already
replaced their KV equivalents in an earlier pass. The legacy
`screenshot_<id>` prefix stays dead/unused (superseded by the real
`hr_screenshots` collection already).

**Step 2 (not started — next, one collection at a time per user's
direction):** for each new collection above, in an order still to be
finalized (`hr_google_integration` first — smallest, already
security-fixed, just needs its storage moved — is the natural first
pick): add `pbAdmin.ts` helpers scoped to that collection, migrate every
`hr_delcargo_store` call site for that key pattern onto the new
collection, live-test as every affected role with disposable test data on
production, delete the test data, then lock the new collection's rules
down to exactly what's needed (and, only once nothing reads the old key
pattern anymore, stop writing it in `hr_delcargo_store` — not delete the
old rows yet, to keep a rollback path). `hr_delcargo_store`'s own rules
stay untouched (still fully public) until every live key pattern still
routing through it has been migrated off.
