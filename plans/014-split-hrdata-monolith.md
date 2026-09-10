# 014 — Split the `hrData.ts` monolith into domain modules

- **Status**: TODO
- **Commit**: (none yet — planning only)
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
