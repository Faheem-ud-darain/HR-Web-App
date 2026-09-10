# 015 — Introduce automated test coverage

- **Status**: TODO
- **Commit**: (none yet — planning only)
- **Severity**: MEDIUM
- **Category**: Codebase / completeness (not part of the animation audit — tracked here for the same reason plans 007-011 are)
- **Estimated scope**: medium to start, open-ended to grow. There are currently zero automated tests anywhere in this repo and no test framework installed. This plan adds the tooling and an initial high-value test set; it deliberately does not attempt full coverage in one pass.

## Problem

`package.json` has no test script, no `vitest`/`jest`/`@playwright/test`
dependency, and there are zero `*.test.ts`/`*.spec.ts` files anywhere in
the repo. Every change to business logic (payroll calculation, absence
detection, leave-day math, date/timezone handling) is currently verified
only by `tsc` (type-correctness, not behavioral correctness) and manual
click-through. This is exactly the kind of codebase where a well-meaning
refactor (like plan 014's `hrData.ts` split) or a future feature change
can silently break payroll math or absence detection with nothing catching
it before it reaches production, run against real employee pay.

## Target

- A test runner is installed and wired up (`vitest` recommended — fast,
  works well with Next.js/TypeScript, no heavy config needed for the
  logic-only tests this plan prioritizes).
- Unit tests exist for the highest-risk, purely-computational logic first:
  `computePayrollView` (payroll math — proration, increments, first-month
  reserve, region/currency handling), absence-reason detection logic,
  leave-day calculation (`getApprovedLeaveDaysInMonth` and similar), and
  the timezone/date utilities (`getNYDateString` and friends) everything
  else depends on.
- A `npm test` script exists and is documented as part of the standard
  dev workflow (README or CLAUDE.md) so it's not forgotten.

## Repo conventions to follow

- If plan 014 has landed first, write tests against the new
  `src/lib/hr/*` domain modules directly (much easier to unit-test in
  isolation than the current monolith); if plan 014 hasn't landed yet,
  test the exported functions from `hrData.ts` as-is — do not block this
  plan on plan 014, but sequence it after 014 if both are being worked at
  once, since testing against the final module boundaries avoids
  rewriting test imports later.
- Prioritize pure-function business logic over React component rendering
  tests — this codebase's highest real risk is silent payroll/absence
  math regressions, not UI rendering bugs (plan 011's tsc-after-every-file
  discipline already caught markup-level issues well).
- Match this repo's existing comment density/quality in test files too —
  a test's "why" (what real scenario it's guarding against, e.g. "employee
  joined on the 6th of the month should be prorated, not full salary")
  should be as clear as this codebase's existing inline comments.

## Steps

1. Install `vitest` (and `@vitest/coverage-v8` for coverage reporting) as
   a dev dependency; add a minimal `vitest.config.ts` scoped to
   `src/lib/**/*.test.ts`, and an `npm test` script.
2. Write tests for `computePayrollView` covering: normal full-month
   employee, mid-month joiner (both <=5 days and >5 days into the month,
   per its own documented proration rule), the anniversary-increment
   deferral rule, and USA-vs-Pakistan currency handling (confirm the two
   currencies are never summed, matching the existing inline comment
   about this in `admin/insights/page.tsx`).
3. Write tests for absence-reason detection (`no_clock_in` / `inactivity`
   / `under_4_hours`) against representative timesheet/heartbeat
   scenarios.
4. Write tests for leave-day calculation across a month boundary (a leave
   spanning two calendar months should split correctly).
5. Write tests for the NY-timezone date utilities — these are load-bearing
   for absence/payroll/leave logic across the whole app, and timezone bugs
   are exactly the kind of thing that passes `tsc` silently while being
   behaviorally wrong.
6. Wire `npm test` into the deploy pipeline (`.github/workflows/`) as a
   required check before merge, once the initial test set is stable and
   not flaky — do this last, after confirming the tests are reliable.

## Boundaries

- Do NOT attempt full test coverage of the entire app in this plan — that
  is not achievable or reviewable in one pass. This plan's scope is the
  computational core listed above; broader coverage (React component
  tests, end-to-end tests) is deliberately a separate, future plan.
- Do NOT add Playwright/end-to-end browser tests in this plan — that's a
  meaningfully larger investment (test environment, fixtures, CI runner
  setup) better scoped as its own follow-up once unit coverage on the core
  logic exists.
- Do NOT change any production logic to "make it more testable" as part of
  this plan unless plan 014 is landing in the same window — testability
  refactors and behavior changes should stay in separate, reviewable
  commits.
- Do NOT block plan 014 (the `hrData.ts` split) on this plan landing first
  — they can proceed independently, with sequencing left to whoever is
  scheduling the work.

## Verification

- **Mechanical**: `npm test` runs and passes locally and (once wired up)
  in CI.
- **Mechanical**: `npx tsc --noEmit -p tsconfig.json` still clean — test
  files must type-check too.
- **Manual**: deliberately introduce a one-line bug in
  `computePayrollView`'s proration math locally, confirm the new test
  suite catches it (a genuine red/green check that the tests aren't just
  passing trivially).
- **Done when**: `npm test` exists, covers the five areas listed in Steps
  with tests that would actually catch a realistic regression in each, and
  is either already wired into CI or has a clear, tracked follow-up to do
  so.
