# 027 — Migrate hr_delcargo_store's data into dedicated collections

- **Status**: TODO
- **Commit**: (none yet — planning only)
- **Severity**: MEDIUM (HIGH for the Phase 3 items — see Problem)
- **Category**: Database / data modeling
- **Estimated scope**: large. ~15-20 distinct data types currently live as
  rows in one generic key/value table (`hr_delcargo_store`) and need real,
  purpose-built collections. Touches `src/lib/pbAdmin.ts`, `src/lib/hr/shared.ts`'s
  KV helpers, and every call site across `src/lib/hr/*.ts` and
  `src/app/api/**` that currently reads/writes a `hr_delcargo_store` key.

## Problem

`hr_delcargo_store` is a single PocketBase collection with two columns —
`key` (text) and `value` (json) — that the app has used as a generic
key/value store for almost every piece of server-side state that didn't
fit an existing collection. Today it holds roughly 20 unrelated data
shapes, identified by grepping every `pbGetKV`/`pbSetKV`/`pbGetKVByPrefix`/
`pbDeleteKVByKeys`/`adminGetKV`/`adminSetKV` call site:

| Key pattern | What it holds | Current file(s) |
| --- | --- | --- |
| `hr_profile_extra_<id>` | Per-profile overlay (mustChangePassword, accountCreationDate, lastIncrementProcessedYear, etc.) | `hr/profiles.ts`, `admin/profile/route.ts`, `profile/me/route.ts`, `auth/login/route.ts` |
| `hr_profile_docs_<id>` | Per-profile document metadata overlay | `hr/profiles.ts`, `admin/profile/route.ts`, `profile/me/route.ts` |
| `hr_deleted_profile_emails_v1` | ONE row: array of every deleted employee's email (tombstones) | `hr/profiles.ts`, `admin/profile/route.ts` |
| `hr_payroll_breakdown_<employeeId>_<month>` | Per-employee-per-month payroll breakdown | `admin/payroll/route.ts`, `payroll/me/route.ts` |
| `user_session_<email>` | Multi-device session enforcement token | `hr/profiles.ts` |
| `password_reset_<email>` | Forgot-password OTP (code, expiry, attempts) | `passwordResetOtp.ts` |
| `otp_ratelimit_<email>` | Forgot-password OTP rate limit/cooldown | `passwordResetOtp.ts` |
| `login_ratelimit_<email>` | Login rate limit (plan 013 step 3) | `rateLimit.ts`, `auth/login/route.ts` |
| `google_integration_<email>` | Google OAuth tokens for calendar/etc. integration | `google/integration/route.ts`, `auth/google/callback/route.ts` |
| `hr_notification_reads_prod_v1` | ONE row: map of `{ notificationId: [readerEmails] }` for **every broadcast notification in the company** | `hr/notifications.ts`, `hr/profiles.ts` |
| `hr_notification_cleared_prod_v1` | Same shape, for "cleared" instead of "read" | `hr/notifications.ts`, `hr/profiles.ts` |
| `hr_notification_prefs_v1` | ONE row: map of `{ email: prefs }` for **every employee's** push preferences | `hr/notifications.ts` |
| `hr_announcement_reads_v1` | ONE row: map of `{ announcementId: [readerEmails] }` | `hr/notifications.ts` |
| `MAINTENANCE_NOTICES_KEY` | ONE row: array of every maintenance notice ever created | `hr/notifications.ts` |
| `MAINTENANCE_NOTICE_READS_KEY` | ONE row: map of `{ noticeId: [readerEmails] }` | `hr/notifications.ts` |
| `hr_message_reads_v1` | ONE row: map of `{ messageId: [readerEmails] }` for **every team-chat message** | `hr/teams.ts`, `hr/profiles.ts` |
| `hr_ticket_closed_at_v1` | ONE row: map of `{ ticketId: closedAtIso }` | `hr/tickets.ts` |
| `hr_ticket_seen_<ticketId>` | Per-ticket "seen by employee" marker | `hr/tickets.ts` |
| `hr_typing_<scope>_<scopeId>_<email>` | Per-user "is typing" ephemeral state | `hr/tickets.ts` |
| `tracker_heartbeat_<email>` | Desktop tracker agent heartbeat | `hr/timesheets.ts`, `hr/profiles.ts` |
| `shift_stop_signal_<email>`, `tracker_quit_intent_<email>`, `tracker_ping_<email>`, `tracker_pong_<email>`, `tracker_stop_cmd_<email>`, `tracker_command_<email>`, `tracker_diagnostics_<email>`, `shift_tab_heartbeat_<email>` | Tracker-agent/browser-tab signal "message bus" (8 separate keys per employee) | `hr/timesheets.ts` |
| `hr_screenshot_retention_state_v1` | ONE row: global screenshot-retention sweep state | `tracking/screenshots-retention/route.ts` |

This causes two distinct, real problems, not just "it's untidy":

1. **Read-modify-write races on shared blobs.** The 8 "ONE row: map of..."
   entries above are each a *single database row* shared by the entire
   company. `markNotificationsAsRead`, `clearAllNotificationsFor`,
   `markAnnouncementRead`, `markMessagesSeen`, etc. all follow the same
   pattern: fetch the whole map, mutate one entry in JS, write the whole
   map back. Two employees marking different notifications read at the
   same moment can race — the second write can silently overwrite the
   first's change, since neither read the other's update before writing.
   This isn't hypothetical lost data (unread counts / cleared-state
   silently reverting) — it's the direct consequence of this schema shape,
   and it gets more likely as headcount grows.
2. **No schema, no indexes, no query rules.** Every row in
   `hr_delcargo_store` looks identical to PocketBase (`key` + opaque
   `value`), so there is no field-level validation, no unique index tying
   e.g. one OTP row to one email, and — per plan 012 — the whole collection
   currently has fully public List/View/Create/Update/Delete rules,
   meaning anyone with the URL can read *and rewrite* session tokens,
   OTP codes, rate-limit counters, and Google OAuth tokens. Splitting into
   dedicated collections is also a prerequisite for locking down rules
   collection-by-collection (some of this data — OTPs, sessions, Google
   tokens — should never be client-readable at all, unlike e.g. typing
   indicators).

## Target

Each data shape above moves into its own PocketBase collection, with real
typed fields instead of an opaque JSON blob wherever the value has a
stable shape, and one row per entity instead of one shared row per
company wherever the old key held a map — turning every read-modify-write
race in problem #1 into an atomic single-row `create`/`update` scoped to
just that entity. `hr_delcargo_store` itself is retired once nothing reads
or writes it anymore (tracked as this plan's last phase) — this directly
unblocks the `hr_delcargo_store` line item in plan 012's Phase 1.

Proposed collections (exact field lists to be finalized against
`fromProfileFields`-style conventions when each phase is implemented):

| New collection | Replaces | Shape |
| --- | --- | --- |
| `hr_profile_extras` | `hr_profile_extra_<id>` | 1 row per profile (`profile` relation, unique; `data` json) |
| `hr_profile_docs` | `hr_profile_docs_<id>` | 1 row per profile (`profile` relation, unique; `data` json) |
| `hr_deleted_profile_emails` | `hr_deleted_profile_emails_v1` | 1 row per deleted email (`email` text, unique; `deleted_at` date) |
| `hr_payroll_breakdowns` | `hr_payroll_breakdown_<id>_<month>` | 1 row per (profile, month) (`profile` relation, `month` text; unique compound) |
| `hr_user_sessions` | `user_session_<email>` | 1 row per email (`email` text, unique; session fields) |
| `hr_password_reset_otps` | `password_reset_<email>` | 1 row per email (`email` unique; `otp`, `expires_at`, `attempts`) |
| `hr_rate_limits` | `login_ratelimit_<email>`, `otp_ratelimit_<email>` | 1 row per rate-limit key (`rate_key` text, unique; `count`, `window_start`) — generalized so any future limiter reuses it, per `rateLimit.ts`'s own design intent |
| `hr_google_integrations` | `google_integration_<email>` | 1 row per email (`email` unique; token fields) |
| `hr_notification_reads` | `hr_notification_reads_prod_v1` | 1 row per (notification, reader) — unique compound (`notification` relation, `email`) |
| `hr_notification_cleared` | `hr_notification_cleared_prod_v1` | same shape as above |
| `hr_notification_prefs` | `hr_notification_prefs_v1` | 1 row per email (`email` unique; prefs fields) |
| `hr_announcement_reads` | `hr_announcement_reads_v1` | 1 row per (announcement, reader) |
| `hr_maintenance_notices` | `MAINTENANCE_NOTICES_KEY` | 1 row per notice (real collection, not an array-in-one-row) |
| `hr_maintenance_notice_reads` | `MAINTENANCE_NOTICE_READS_KEY` | 1 row per (notice, reader) |
| `hr_message_reads` | `hr_message_reads_v1` | 1 row per (message, reader) |
| `hr_ticket_closed_at` | `hr_ticket_closed_at_v1` | 1 row per ticket (`ticket` relation, unique; `closed_at` date) |
| `hr_ticket_seen` | `hr_ticket_seen_<id>` | 1 row per ticket (already effectively this shape — just a real collection now) |
| `hr_typing_indicators` | `hr_typing_<scope>_<id>_<email>` | 1 row per (scope, scopeId, email) |
| `hr_tracker_signals` | `tracker_heartbeat_<email>` + the 7 other per-employee tracker/shift keys | 1 row per employee, with a real column per signal (heartbeat, stop_signal, quit_intent, ping, pong, stop_cmd, command, diagnostics, tab_heartbeat) instead of 8 separate `hr_delcargo_store` rows per employee |
| `hr_system_state` | `hr_screenshot_retention_state_v1` | 1 row per named global-state key (generalized singleton-state table, in case another global sweep needs this later) |

`hr_tracking_settings` and `hr_ticket_presence` are **not** in this plan —
per `shared.ts`'s own comment, those two were already migrated off
`hr_delcargo_store` onto real collections via `pbUpsertByField`/
`pbFindByField` before this plan existed. This plan follows that same
already-proven pattern.

## Repo conventions to follow

- Mirror the exact 1:1 migration this repo already did for
  `hr_tracking_settings`/`hr_ticket_presence`: add the new collection in
  PocketBase, add typed helper functions (`pbUpsertByField`/
  `pbFindByField`-style for client-side callers in `hr/*.ts`, or
  `adminX`-style additions to `pbAdmin.ts` for server-only API routes),
  swap every call site, verify live, *then* remove the old key's reads/
  writes — never both at once.
- Same admin-vs-client split as everywhere else in this codebase:
  anything reached from `'use client'` files goes through `pb.collection(...)`
  (the browser's own PocketBase client, via `src/lib/hr/shared.ts`'s
  helpers); anything reached from `src/app/api/**` uses the server-only
  superuser client in `pbAdmin.ts`. Never import `pbAdmin.ts` from a
  client file.
- New collections that hold anything sensitive (OTPs, sessions, rate
  limits, Google tokens) should get admin-only PocketBase rules **from
  creation**, not "public now, lock later" — there's no existing public
  dependency to break, unlike the collections plan 012 is unwinding.
  Collections that mirror already-public data (typing indicators, ticket
  seen state) can start with the same posture as today and get tightened
  together with plan 012's remaining phases.
- For every "ONE row: map of X" collection (Phase 3 below), the new
  collection needs a unique compound index (e.g. `notification` +
  `email`) so a duplicate mark-as-read attempts to `create` and gets a
  clean constraint violation instead of a second silent row — the ORM
  helper should catch that specific case and treat it as "already read"
  rather than an error.

## Steps (phased — see Boundaries on ordering)

1. **Phase 1 — auth/security-sensitive singletons** (small blast radius,
   most valuable to get off a fully-public generic table first):
   `hr_user_sessions`, `hr_password_reset_otps`, `hr_rate_limits`,
   `hr_google_integrations`.
2. **Phase 2 — profile overlays** (per-profile 1:1 data, read on most
   dashboard loads): `hr_profile_extras`, `hr_profile_docs`,
   `hr_deleted_profile_emails`, `hr_payroll_breakdowns`.
3. **Phase 3 — shared-blob read-state** (the real race-condition fix —
   highest functional value, do this deliberately rather than rushing):
   `hr_notification_reads`, `hr_notification_cleared`,
   `hr_notification_prefs`, `hr_announcement_reads`, `hr_message_reads`,
   `hr_maintenance_notices`, `hr_maintenance_notice_reads`,
   `hr_ticket_closed_at`.
4. **Phase 4 — ephemeral tracker/shift/presence signals** (highest write
   frequency — test carefully against a real tracker-agent session and
   multiple open browser tabs, not just a single manual click):
   `hr_tracker_signals`, `hr_typing_indicators`, `hr_ticket_seen`.
5. **Phase 5 — cleanup**: `hr_screenshot_retention_state_v1` →
   `hr_system_state`; delete now-dead code paths in `shared.ts`/
   `pbAdmin.ts` (`pbGetKV`/`pbSetKV`/`pbGetKVByPrefix`/`pbDeleteKVByKeys`/
   `adminGetKV`/`adminSetKV`) once no call site references
   `hr_delcargo_store` anymore; confirm via repo-wide grep; then either
   delete the `hr_delcargo_store` collection entirely or lock its rules to
   admin-only as a dead/frozen table — coordinate this with whichever of
   plan 012's phases is current, since plan 012 also lists
   `hr_delcargo_store` as a Phase 1 target for the exact same reason.

For each collection within a phase: create the PocketBase collection with
real fields/indexes/rules → add the typed helper(s) → write a one-time,
idempotent migration script (reads every matching `hr_delcargo_store` row
for that key pattern via `pbAdminFetch`, writes it into the new
collection, logs a before/after count) → run it against production →
update every call site to read/write the new collection → live-test every
affected flow as every affected role → only once verified, stop writing
to the old key (leave the already-migrated old rows in place until Phase
5's final cleanup, in case a rollback is needed) → move to the next
collection.

## Boundaries

- Do NOT delete any `hr_delcargo_store` row until its replacement
  collection has been live-verified — this is production data with no
  staging copy, and every one of these keys backs a real feature someone
  is actively using (sessions, OTPs, notifications, tracker signals).
- Do NOT batch multiple phases into one migration run. Each phase should
  be its own set of commits, live-verified before the next phase starts,
  matching how plan 012 is sequenced.
- Do NOT change `hr_tracking_settings` or `hr_ticket_presence` — they're
  already done, following the same pattern this plan extends.
- Do NOT invent a second superuser/admin client or a second generic KV
  abstraction — extend `pbAdmin.ts` and `shared.ts` as described above.
- Do NOT touch plans 001-026's own work, and do NOT lock any
  `hr_delcargo_store` rule beyond what Phase 5 describes until every
  phase before it is done (this plan's Phase 5 and plan 012's own
  `hr_delcargo_store` line item are the same lock — do it once, from
  whichever plan reaches it first, and cross-reference the other).
- Migration scripts must be idempotent (safe to re-run) and must log
  counts rather than silently succeeding, since there is no staging
  environment to rehearse against first.

## Verification

- **Mechanical**: `npx tsc --noEmit -p tsconfig.json` clean after every
  phase.
- **Migration-specific**: each migration script logs "N old rows found /
  M new rows written / N-M skipped (already migrated)" and this plan's
  implementation notes record those counts per collection.
- **Manual, per phase**: exercise every affected flow live, as every
  affected role, against production — e.g. Phase 3's notification-read
  migration needs marking a broadcast notification read from two
  different accounts to confirm no shared-row overwrite is possible
  anymore (the actual bug this phase fixes).
- **Done when**: `hr_delcargo_store` has zero remaining application call
  sites (confirmed via repo-wide grep for `hr_delcargo_store`,
  `pbGetKV`/`pbSetKV`/`pbGetKVByPrefix`/`pbDeleteKVByKeys`/`adminGetKV`/
  `adminSetKV`), and its PocketBase rules are locked/the collection is
  retired.

## Implementation notes (in progress)

**Phase 1 (auth/security singletons) — DONE (2026-09-11).** Commits:
`21bc13b` (this plan doc), `5219930` (code), `b8bdd4a` (hotfix),
`06bc71b` (hr_user_sessions reconciliation).

- `hr_rate_limits` (rate_key unique, data json), `hr_password_reset_otps`
  (email unique, data json), `hr_google_integrations` (email unique, data
  json) created fresh, admin-only rules from creation. `hr_user_sessions`
  turned out to already exist from earlier, unrecorded prep work — with a
  `data` field (not the `slots` name this plan's code first used) and
  admin-only rules left over from however it was originally set up; code
  was reconciled to match the collection that's actually there, and its
  rules were brought to the same public posture hr_tracking_settings/
  hr_ticket_presence already have (required since this app never produces
  a PocketBase-recognized login — see plan 012 — so an admin-only rule
  silently blocks the anonymous client-side calls profiles.ts makes).
- Added `adminFindByField`/`adminUpsertByField`/`adminDeleteByField` to
  `pbAdmin.ts` as the server-side mirror of `shared.ts`'s existing
  `pbFindByField`/`pbUpsertByField`.
- Collections were created/inspected/rule-patched via a temporary,
  admin-only `src/app/api/admin/schema-migration` route (neither sandbox
  this was built in has direct network access to pb.delcargo.us — see that
  route's own comment) — triggered from the browser console using the
  user's own real admin session token. Not a permanent part of the API
  surface; remove once all phases are done.
- **Real bug caught live**: `checkRateLimit` runs in
  `auth/login/route.ts` BEFORE that route's own try/catch (deliberately —
  so a rate-limit rejection happens before any credential check), so the
  moment it started targeting `hr_rate_limits` — which didn't exist yet at
  that point — every single login attempt, every account, threw an
  unhandled error. Fixed by making `checkRateLimit`/`clearRateLimit` fail
  OPEN on any storage error (rate limiting is defense-in-depth, not core
  auth — it must never be a single point of failure for login itself).
  Found the same unguarded-write gap in `claimUserSessionSlot`
  (hr_user_sessions) and fixed it the same way, matching the fail-open
  pattern `touchUserSessionSlot` already used.
- **Existing rows NOT migrated** for `user_session_<slug>` — the key is a
  lossy slugified email that can't be reversed exactly, and every session
  function already re-claims a slot from scratch when none is found, so
  old sessions are simply abandoned rather than migrated (a one-time
  "looks like a new device on next check-in" event, not a break).
  `password_reset_<email>`, `otp_ratelimit_<email>`, `login_ratelimit_<email>`,
  and `google_integration_<email>` rows in `hr_delcargo_store` ARE
  reversible (their key is just the exact lowercased email/rate-key, no
  lossy transform) but were also left in place for now rather than
  migrated — these are all short-lived/self-expiring data (OTPs 10min,
  rate-limit windows 15min-24h), so the old rows age out naturally; a
  bulk-copy script was judged not worth the added risk for data that
  expires on its own within a day.
- **Live-verified**: Admin login (exercises checkRateLimit/clearRateLimit
  end-to-end) succeeded cleanly post-fix. A real Employee account
  (`faheem@delcargo.us`, logged in directly by the user — this session
  never handles account passwords itself, even when explicitly offered)
  logged in cleanly, exercising `claimUserSessionSlot`/hr_user_sessions
  end-to-end with no errors.
- Forgot-password OTP flow and the Google integration connect/disconnect
  flow were NOT live-tested this phase (no test trigger available without
  sending a real email or performing a real Google OAuth round-trip) —
  flagged as lower-confidence pending a real exercise of those two paths.

**Phase 2 (profile overlays) — DONE (2026-09-11).**

- `hr_profile_extras` (profile_id unique, data json, public), `hr_profile_docs`
  (profile_id unique, data json, public), `hr_deleted_profile_emails` (email
  unique, deletedAt text, public), `hr_payroll_breakdowns` (breakdown_key
  unique, data json, admin-only) created via `ensurePhase2Collections`.
  `hr_profile_docs` pre-existed from earlier unrecorded prep work with the
  right fields but leftover admin-only rules (same root cause as
  `hr_user_sessions` in Phase 1) — caught via `describePhase2Collections`
  and fixed with the newly-generalized `makeCollectionPublic` action.
- Rewrote `profiles.ts` (`getProfileExtras`/`saveProfileExtras`/
  `getProfileDocuments`/`saveProfileDocuments`, the extras-prefix fetch in
  `useProfiles()`, and the tombstone add/clear in `addEmployee`/
  `deleteEmployee`), `admin/profile/route.ts` and `profile/me/route.ts`
  (both now use small local `getExtras`/`mergeExtras`/`mergeDocs` helpers
  instead of raw `adminGetKV`/`adminSetKV` calls), `auth/login/route.ts`'s
  offboarded-status check (rewritten to `adminFindByField` + its own
  fail-open try/catch, matching Phase 1's `checkRateLimit` reasoning),
  `payroll/me/route.ts` and `admin/payroll/route.ts` (breakdown lookups/
  writes against `hr_payroll_breakdowns`).
- **Live-verified**: real Employee login (`faheem@delcargo.us`, logged in
  directly by the user) succeeded post-Phase-2 with no errors reported.
  Profile-edit and document-upload were not explicitly re-confirmed by the
  user as separately tested beyond that login — worth a spot-check next
  time either screen is touched, but not blocking further phases.

**Phase 3 (shared-blob read-state) — code done, schema/live-verification
pending.**

- Added `pbGetReadMap(collection)`/`pbMarkRead(collection, entityId, email)`
  to `shared.ts` and `pbDeleteByField(collection, field, value)` (the
  delete-side counterpart to `pbFindByField`/`pbUpsertByField`, needed for
  `hr_ticket_closed_at`'s clear-on-reopen). A "read receipt" is a
  create-once, append-only fact — creating a row either succeeds (first
  read) or fails on the unique `read_key` index (already read), so there's
  nothing to fetch-mutate-write-back and race on, unlike the old shared
  `{ entityId: [readerEmail, ...] }` blob rows.
- Rewrote `notifications.ts` (`getNotificationReadMap`/
  `getNotificationClearedMap`/`markNotificationsAsRead`/
  `clearAllNotificationsFor`/`getAnnouncementReadMap`/`markAnnouncementRead`/
  `markAnnouncementsSeen` against `hr_notification_reads`/
  `hr_notification_cleared`/`hr_announcement_reads` via `pbGetReadMap`/
  `pbMarkRead`; `getNotificationPrefs`/`updateNotificationPrefs` against a
  plain `hr_notification_prefs` collection via `pbFindByField`/
  `pbUpsertByField`; `getMaintenanceNotices`/`addMaintenanceNotice`/
  `deleteMaintenanceNotice` against a real `hr_maintenance_notices`
  collection — one row per notice, via `pbList`/`pbCreate`/`pbDelete` and a
  new `toMaintenanceNotice` converter, instead of one array-blob row — and
  `getMaintenanceNoticeReadMap`/`markMaintenanceNoticeRead` against
  `hr_maintenance_notice_reads`), `teams.ts` (`getMessageReadMap`/
  `markMessagesSeen` against `hr_message_reads`), and `tickets.ts` (the
  ticket-closed-at timer in the status-update handler and
  `checkTicketAttachmentRetention`, against `hr_ticket_closed_at` — a
  dedicated per-ticket collection, not a read-receipt shape, since it's one
  timestamp per ticket rather than a set of readers).
- Extended the temporary `schema-migration` route with
  `ensurePhase3Collections`/`describePhase3Collections`, covering 5
  read-receipt collections (`hr_notification_reads`, `hr_notification_cleared`,
  `hr_announcement_reads`, `hr_message_reads`, `hr_maintenance_notice_reads`
  — each `read_key` unique/`entity_id`/`email`, public rules) plus
  `hr_notification_prefs`, `hr_maintenance_notices`, and
  `hr_ticket_closed_at` — all public, matching this app's existing
  anonymous-client-reach posture (tightening is plan 012's job).
- `npx tsc --noEmit` clean.
- **Not yet done**: the user still needs to run `ensurePhase3Collections`
  from their own authenticated admin browser console (same pattern as
  Phases 1-2), then `describePhase3Collections` to check for any
  pre-existing-but-mismatched collections (caught real issues twice
  already, in Phases 1 and 2), then live-verify: mark a notification/
  announcement/message read from two accounts to confirm the race is
  actually gone, post and read a maintenance notice, and close/reopen a
  ticket to confirm the attachment-retention timer still tracks correctly.
