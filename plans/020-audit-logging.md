# 020 — Audit logging for sensitive actions

- **Status**: TODO
- **Commit**: (none yet — planning only)
- **Severity**: HIGH (standard compliance expectation for payroll/HR software)
- **Category**: Security / compliance readiness
- **Estimated scope**: medium. One new collection, one shared server-side helper, calls added to every existing sensitive-action route/function.

## Problem

There is currently no record anywhere of who changed what and when for any
sensitive action — who edited an employee's salary, who approved or
rejected a leave, who deleted a warehouse, who offboarded an account, who
changed another user's password. If a payroll dispute, a data-deletion
question, or a "someone changed my salary without telling me" complaint
ever comes up, there is no audit trail to answer it from — only whatever
happens to still be reconstructable from `hr_payroll`/`hr_profiles`
record timestamps, which don't capture *who* made a change or what the
prior value was. This is close to a hard requirement for any HR/payroll
product being sold to other companies — buyers and their own employees
will expect this kind of accountability to exist.

## Target

A new `hr_audit_log` collection (locked down per plan 012's model — HR/
Admin read-only via an API route, no direct public/client access at all,
write-only from server-side code) records, for every sensitive action:
who performed it (email + role), what action, what record was affected,
a before/after diff where practical (e.g. salary change: old value → new
value), and a timestamp. HR/Admin get a read-only Audit Log page to search
and filter this history.

## Repo conventions to follow

- Route this collection through `pbAdmin.ts` exactly like every other
  security-sensitive collection in plan 012 — never expose it to direct
  client `pb.collection(...)` access.
- Log at the server-side API-route layer (once plan 012's routes exist)
  or at the `hrActions.*` function boundary for anything not yet migrated
  to an API route — the goal is one consistent call site per sensitive
  action, not scattered logging calls duplicated across every UI
  component that happens to trigger that action.
- Match the existing notification pattern's shape
  (`adminAddNotification`) for the new `adminLogAudit`-style helper in
  `pbAdmin.ts` — same file, same conventions, so it reads as part of the
  same system rather than a bolted-on addition.
- Sequence this plan after (or alongside) plan 012 — it's much easier to
  add audit logging at the same time sensitive actions are being moved
  behind server-side API routes than to retrofit it afterward.

## Steps

1. Create the `hr_audit_log` PocketBase collection (admin-only rules from
   day one — this collection has no legitimate public-facing use, unlike
   the collections in plan 012 that start public and get locked down).
2. Add a shared `adminLogAudit(actorEmail, actorRole, action, targetType,
   targetId, before, after)` helper to `pbAdmin.ts`.
3. Wire it into every sensitive action, prioritized by risk: salary/payroll
   edits, password/credential changes, employee offboarding/deletion,
   leave approval/rejection, role changes, warehouse/team structure edits.
4. Build a read-only Audit Log page (Admin-only, matching existing page
   conventions — a filterable table, similar shape to `hr/leaves`' History
   tab) to browse this collection.
5. Document a retention policy for this collection (audit logs
   arguably should be retained *longer* than the operational data they
   describe, not deleted alongside it — this is the deliberate opposite
   of the auto-delete conversation from earlier in this session).

## Boundaries

- Do NOT log every read/view action — only state-changing actions (create/
  update/delete of sensitive data). A full request log is a much larger,
  separate observability concern (see plan 017's monitoring work) and
  would make this collection unreviewably noisy.
- Do NOT store full plaintext of highly sensitive fields (passwords,
  TOTP secrets) in the audit log even as a "before" value — log that a
  password was changed, never the password itself.
- Do NOT make this collection deletable by anyone through the app's own
  UI, including Admin — audit logs that can be edited or deleted by the
  same accounts they're meant to hold accountable defeat their own
  purpose.

## Verification

- **Mechanical**: `npx tsc --noEmit -p tsconfig.json` clean.
- **Manual**: perform one of each logged action type (edit a salary,
  approve a leave, offboard a test account) and confirm a corresponding,
  correctly-attributed audit log entry appears.
- **Manual**: confirm the audit log collection cannot be read, edited, or
  deleted via a direct PocketBase API call without admin credentials.
- **Done when**: every sensitive action listed in Steps produces an audit
  log entry, and Admin has a working page to search/filter that history.
