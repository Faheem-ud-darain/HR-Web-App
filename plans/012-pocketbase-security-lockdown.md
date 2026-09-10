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
