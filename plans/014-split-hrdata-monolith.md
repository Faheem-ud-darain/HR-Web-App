# 014 — Split the `hrData.ts` monolith into domain modules

- **Status**: DONE (2026-09-10)
- **Commit**: f4af413..a14c1cd (12 commits: types, shared, notifications,
  careers, tasks, tickets, teams, leaves, timesheets, absences, profiles,
  payroll)
- **Severity**: MEDIUM
- **Category**: Codebase / structure (not part of the animation audit — tracked here for the same reason plans 007-011 are)
- **Estimated scope**: large, mechanical-but-risky. `src/lib/hrData.ts` is several thousand lines mixing type definitions, PocketBase fetch functions, React Query hooks, and business logic (payroll math, absence detection, pagination helpers, etc.) for every feature area in the app. This plan splits it by domain without changing any exported behavior.

## Problem

`src/lib/hrData.ts` is a single file that every other file in the app
imports from (`useProfiles`, `useTimesheets`, `hrActions.computePayrollView`,
`AbsenceRecord`, `TrackingSettings`, and dozens more) — types, fetch
functions, cached-query hooks, and non-trivial business logic (payroll
calculation across regions/currencies, absence-reason detection, increment
scheduling) all live in one place. This was fine at the app's original
size; at its current size it's a real structural liability:

- Any change anywhere in payroll, leaves, tasks, tracking, or profiles logic
  touches the same file, so merge conflicts concentrate here and it's hard
  to reason about blast radius of a change.
- There's no enforced boundary between "pure data fetching," "business
  logic," and "React hook," so testing any one piece in isolation (see
  plan 015) means importing the entire file's dependency graph.
- New contributors (or a future session) have to read a very large file to
  understand any single feature area, instead of opening one focused
  module.

## Target

`hrData.ts`'s exports are preserved exactly (same names, same signatures)
but re-exported from a new `src/lib/hr/` directory split by domain, so
every existing `import { X } from '@/lib/hrData'` call site keeps working
unchanged:

```
src/lib/hr/
  types.ts          // every exported interface (Profile, TimesheetEntry, AbsenceRecord, PayrollRecord, ...)
  profiles.ts        // useProfiles, profile CRUD actions
  timesheets.ts      // useTimesheets, clock in/out, autoClose* functions
  payroll.ts          // computePayrollView and everything payroll-math related
  leaves.ts           // useLeaves, leave application logic
  absences.ts         // AbsenceRecord logic, runAbsenceCheck
  tasks.ts            // useTasks
  tickets.ts          // ticket-related hooks/actions
  teams.ts            // team/warehouse logic
  notifications.ts    // notification hooks/actions
  shared.ts           // getNYDateString and other cross-domain utilities
```

`src/lib/hrData.ts` itself becomes a thin barrel file re-exporting from
`src/lib/hr/*`, so this is a non-breaking, purely structural refactor —
not a rewrite of any logic.

## Repo conventions to follow

- Zero behavior changes. This is a file-organization refactor only — if a
  function's logic looks wrong while moving it, note it and leave it for
  a separate bug-fix plan, exactly per the same rule plan 011 followed for
  markup migration.
- Preserve every existing comment verbatim when moving code — this
  codebase's comments carry real institutional history (see e.g. the
  `MIN_SHIFT_AGE_MS` comment in `pb_hooks/auto_close_stale_shifts.pb.js`)
  and must not be lost or paraphrased during the move.
- Match the existing hook naming/shape (`useX` via React Query,
  `hrActions.y` for imperative actions) — this plan reorganizes files, it
  does not change the public API shape.
- Run `npx tsc --noEmit -p tsconfig.json` after moving each domain module,
  not just once at the end — a single big-bang move makes it much harder
  to isolate which extraction broke a type.

## Steps

1. Read `hrData.ts` in full and produce a dependency map: which exports
   depend on which others, and which are genuinely cross-domain
   (`getNYDateString`, `formatMoney`, and similar utilities used
   everywhere) versus domain-specific.
2. Create `src/lib/hr/types.ts` first and move every exported interface
   there — types have no runtime behavior, so this is the lowest-risk
   first extraction and unblocks everything else.
3. Create `src/lib/hr/shared.ts` for genuinely cross-domain utilities
   (date/currency formatting, generic helpers used by 3+ domains).
4. Extract one domain module at a time, smallest/most self-contained
   first (suggested order: notifications -> teams -> tickets -> tasks ->
   leaves -> absences -> timesheets -> payroll — payroll last since it
   depends on timesheets/absences/leaves all being extracted first).
   After each: `hrData.ts` re-exports from the new module, run `tsc`,
   commit.
5. Once every domain is extracted, `hrData.ts` should contain only
   re-export statements — confirm with a line count and a diff review
   that nothing was silently left behind or duplicated.

## Boundaries

- Do NOT change any function's logic, only its file location and (where
  strictly necessary) its import paths.
- Do NOT change any exported name or signature — every existing call site
  across the ~100 files that import from `@/lib/hrData` must keep working
  with zero edits.
- Do NOT attempt this in one commit — extract and verify one domain at a
  time per Steps, so a mistake in one extraction doesn't block or get
  tangled with the others.
- Do NOT start plan 015 (test coverage) as part of this plan — do the
  structural split first, then add tests against the new module
  boundaries as a separate, follow-up plan so each stays reviewable on its
  own.

## Verification

- **Mechanical**: `npx tsc --noEmit -p tsconfig.json` clean after every
  single domain extraction, not just at the end.
- **Mechanical**: `grep -c "^export" src/lib/hrData.ts` before and after —
  the barrel file's export count should match what it re-exports from
  `src/lib/hr/*`, confirming nothing was dropped.
- **Manual**: spot-check 3-4 pages that import heavily from `hrData.ts`
  (e.g. `admin/payroll/page.tsx`, `hr/leaves/page.tsx`) and confirm they
  still build and render identically — no behavior change should be
  visible anywhere.
- **Done when**: `hrData.ts` is a pure barrel/re-export file, every domain
  lives in its own focused module under `src/lib/hr/`, and the app behaves
  identically to before the split.

## Implementation notes

Executed as 12 sequential commits, one per domain module, each verified
with a clean `npx tsc --noEmit -p tsconfig.json` before moving on, exactly
per this plan's own Steps/Boundaries. Extraction order followed the plan's
suggested sequence (types -> shared -> notifications -> ... -> payroll
last), with one addition: `careers.ts` split out separately between
notifications and tasks, since job postings/applications didn't fit
naturally into any of the 10 named modules (see judgment calls below).

**Final result**: `src/lib/hrData.ts` went from 4716 lines / 127 exports
to 147 lines containing only `import`/`export { ... } from './hr/*'`
statements, an `export * from './hr/types'`, and the reassembled
`export const hrActions = { ...profileActions, ...notificationActions,
...careerActions, ...taskActions, ...ticketActions, ...teamActions,
...leaveActions, ...timesheetActions, ...absenceActions, ...payrollActions,
...sharedActions }`. Every one of the original 127 exported names was
diffed against the new barrel's full export surface (types via
`export * from './hr/types'`, everything else via named re-exports) and
confirmed present — nothing dropped or duplicated. No importing file
(the ~100 files across the app that `import ... from '@/lib/hrData'`)
needed any changes; the final whole-project `tsc --noEmit` (which
type-checks every one of those call sites) is clean.

**Module layout** (11 files, one more than the plan's 10 — flagged below):
`types.ts`, `shared.ts`, `notifications.ts`, `careers.ts`, `tasks.ts`,
`tickets.ts`, `teams.ts`, `leaves.ts`, `timesheets.ts`, `absences.ts`,
`profiles.ts`, `payroll.ts`.

**Judgment calls made** (per this plan's explicit invitation to use
judgment where the 10-module list didn't cleanly fit something, and flag
it):

- **`careers.ts` added as an 11th module.** Job-listing/application logic
  (`useCareers`, `getCareerApplicationsAdmin`, `updateApplicationStatusAdmin`,
  `getCareerApplicationsForEmailAdmin`, `deleteCareerApplicationsForEmailAdmin`,
  `careerActions`) didn't fit naturally into `tasks.ts` or `profiles.ts` —
  it's its own PocketBase collection pair (`hr_careers` /
  `hr_career_applications`) with no real overlap with either, so giving it
  its own small file was clearer than forcing it into an unrelated one.
- **Warehouses folded into `teams.ts`**, not a separate `warehouses.ts` —
  the plan's own module list didn't include warehouses at all, and
  `useWarehouses`/`toWarehouse` are small and only ever consumed alongside
  Teams (a team's `warehouseId` field), so a dedicated file would have
  been a near-empty module.
- **Multi-device session enforcement placed in `profiles.ts`**, not its
  own module — it's fundamentally about one Profile's login-session state
  (`userSessionKeyFor`, `MAX_USER_SESSION_DEVICES`), not a separate domain.
  (This one had a real detection-and-recovery story: seen below.)
- **`checkScreenshotRetention` grouped into `absences.ts`** alongside
  Mouse inactivity logs — in the original file it sat directly under the
  "Mouse inactivity logs" section banner with no divider of its own, and
  both are downstream of the same tracker-agent capture pipeline.
- **`isWeekday` landed in `leaves.ts`**, not `payroll.ts` or `absences.ts`
  — it happened to sit physically between `getRemainingPTO` and
  `getApprovedLeaveOnDate` in the original file, and it's genuinely
  cross-domain (both `absences.ts` and `payroll.ts` now import it back
  from `leaves.ts` via the barrel), so it stayed where it naturally fell
  rather than being force-placed in whichever domain used it most.
- **`HR_ADMIN_LINE_TEAM_ID` placed in `shared.ts`**, not `teams.ts` (where
  it's conceptually closest) — `notifications.ts` also needs it (for the
  HR & Admin Line forwarding badge) and `notifications.ts`/`teams.ts` have
  no other reason to import from each other, so putting it in `shared.ts`
  avoided introducing a circular import between those two for the sake of
  one constant.
- **`NotificationReadMap` made exported** (`export type` in `hr/types.ts`)
  — it was a private, unexported type in the original file, but both
  `notifications.ts` and `teams.ts` need to reference it now that they're
  separate modules with their own type-checking, so it moved from
  file-private to genuinely shared. Visibility-only change, no behavior
  difference (nothing about the type itself changed).
- **KV Overlay Helpers (`getKV`/`setKV`) moved into `shared.ts`** as
  `export const sharedActions = { getKV, setKV }`, spread into `hrActions`
  alongside every other domain's own actions object — done in the final
  (payroll) commit, for consistency, rather than leaving one pair of
  writes inline in the barrel file while everything else was reassembled
  from domain-specific `*Actions` objects.

**Circular-import pattern used throughout**: many moved functions call
`hrActions.xxx(...)` (self-reference) or reference a helper that ended up
in a different domain file than the call site. Rather than rewriting each
call site, every domain file that needs this does
`import { hrActions, someHelper } from '../hrData';` — safe because these
bindings are only read inside function bodies invoked later at runtime,
never at module-evaluation time, which ES modules handle correctly even
though `hrData.ts` imports the domain files and the domain files import
back from `hrData.ts`. This one uniform rule avoided having to individually
track and rewrite ~90 call sites across the split.

**Bug caught and fixed during the split (not a pre-existing app bug —
introduced and caught within this same refactor)**: while extracting
`absences.ts`, the line range initially computed for the "Absence
records" `hrActions` section accidentally swallowed the entire
"Multi-device session enforcement" section right after it (the two
sections run together in the original file with no extraction-order
grep taken between them). Caught by the brace-balance self-check
(`sum of '{' minus '}' per file`, run on every new file immediately after
writing it, before ever running `tsc`) showing a nonzero imbalance, and
a boundary-scan confirming the unexpected `// ── Multi-device session
enforcement` banner sitting inside what should have been a pure Absence
Records object. Fixed by extracting the misplaced ~190-line chunk back
out of the draft `absences.ts`, re-inserting it into `hrData.ts` in its
original position, and letting the (later) `profiles.ts` extraction pick
it up correctly — verified clean both times. Several smaller
off-by-one-line truncations (a function missing its final closing brace,
leaving an orphaned duplicate fragment behind in `hrData.ts`) were caught
and fixed the same way in `notifications.ts`, `tickets.ts`, `teams.ts`,
`leaves.ts`, `absences.ts`, and `payroll.ts` — always a pure
line-range-boundary mistake during the move, never a change to any
function's actual logic.

**Left for human review before pushing** (per this plan's own boundary —
local commits only, not pushed): all 12 commits are local, unpushed, and
ready for review.

**Post-extraction independent verification** (done in this same session,
after the extraction subagent reported back): re-ran `tsc --noEmit`
clean; independently confirmed a real heavy importer
(`admin/payroll/page.tsx`'s `import { usePayroll, useProfiles, useLeaves,
useTimesheets, hrActions, formatMoney, PayrollRecord, AbsenceRecord,
applyIncrementServer, upsertPayrollRecordAdmin, updateProfileAdmin } from
'@/lib/hrData'`) still resolves cleanly against the new barrel; checked
the 7 domain files that import back from `../hrData` (`absences.ts`,
`notifications.ts`, `tasks.ts`, `teams.ts`, `tickets.ts`,
`timesheets.ts`, plus one via a comment only) and confirmed every such
import is only ever used inside function bodies (never at module-eval
time), which is what makes the circular `hrData.ts` <-> `hr/*.ts` import
pattern safe here. The scratch artifacts (`src/lib/hrData.ts.orig`,
`build_*.py`, `scripts_extract.py`, `__pycache__/`) have been deleted —
their job (a source-of-truth to diff against) was already done and
confirmed, and they weren't meant to be permanent.
