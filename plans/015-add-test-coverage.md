# 015 — Introduce automated test coverage

- **Status**: DONE (all 6 steps)
- **Commit**: 64e8a53 (step 1: vitest setup), c4c6689 (step 2: payroll),
  dcbe8af (step 5: timezone), a019ec0 (step 4: leaves), 20c6ed5
  (step 3: absences), 6be188d (step 6: CI wiring)
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

## Implementation notes

**All 6 steps done.** `vitest` 3.2.7 + `@vitest/coverage-v8` 3.2.7 (pinned
below vitest 5, which requires `@types/node` 22+ and conflicts with this
repo's `@types/node` ^20) installed as dev dependencies; `vitest.config.ts`
scopes the runner to `src/lib/**/*.test.ts` only, per this plan's own
boundaries; `npm test` runs `vitest run`. 45 tests across 4 files, all
green, `npx tsc --noEmit -p tsconfig.json` clean throughout.

**Payroll (`src/lib/hr/payroll.test.ts`, 9 tests)** — full real coverage
of `computePayrollView`: a normal full-month long-tenured employee; the
mid-month-joiner proration threshold (`joinDayOfMonth <= 5` = full salary
vs `> 5` = prorated), including the boundary day itself; the anniversary-
increment deferral rule (an anniversary event only affects pay starting
the calendar month AFTER its own month — tested both directly via
`getPendingIncrementForPayrollMonth` and through `computePayrollView`'s
own `incrementAmount`); and that USA vs Pakistan payroll records are
never blended into one cross-region number (each record stays scoped to
its own employee's own region/native-currency figure; a Pakistan-only
absence never affects a USA employee's deduction). "Today" is pinned via
`vi.setSystemTime` so `targetMonthKey` is deterministic.

One real wrinkle surfaced while writing these: `computePayrollView` reads
`joinDayOfMonth` via `new Date(emp.joinedDate)` + NY-timezone conversion.
A plain `"YYYY-MM-DD"` string parses as UTC midnight, which rolls back to
the previous evening once converted to America/New_York (EDT, UTC-4 in
September) — e.g. `"2026-09-07"` reads back as NY calendar day 6, not 7.
This is pre-existing production behavior (the exact caveat `absences.ts`
already documents for its own `joinedStr` handling), not a bug — test
fixtures' `joinedDate`/leave-`duration` strings are deliberately offset by
one calendar day from the actual value they're meant to exercise,
confirmed against real output rather than assumed. Same technique reused
in `leaves.test.ts` and `absences.test.ts`.

**Timezone (`src/lib/timezone.test.ts`, 14 tests)** — full coverage of
`getNYDateString`, `formatDateNY`/`formatShortDateNY`, `getNYMidnight`
(both its EDT and EST guess-then-correct branches, plus a DST-transition
boundary date), `formatRelativeDateNY`, and `formatTimeNY`.

**Leaves (`src/lib/hr/leaves.test.ts`, 13 tests)** — full coverage of
`getApprovedLeaveDaysInMonth` splitting a single leave correctly across a
calendar-month boundary (not double-counted, not all attributed to one
side), type/status/employee-name filtering, malformed-duration handling,
`countApprovedLeaveRequestsInMonth`'s per-request (not per-day) counting
across the same boundary, `getApprovedLeaveOnDate`/`isApprovedLeaveOnDate`'s
inclusive-range matching, and `isWeekday`.

**Absences (`src/lib/hr/absences.test.ts`, 9 tests)** — `runAbsenceCheck`
is not a pure function: it does real PocketBase reads (`hrActions`,
re-exported from `../hrData`) and writes (`pbCreate`, from `./shared`),
plus sends notifications. Per this plan's boundary against refactoring
production code for testability, this suite mocks those dependencies with
`vi.mock` instead: `../hrData`'s `hrActions`/`fetchTimesheetsFresh`/
`displayName` are stubbed with controllable per-test fixtures, while
`isWeekday`/`isApprovedLeaveOnDate` are re-exported as their REAL
implementations (imported from `./leaves`, their actual home) so the
date/weekday/leave-overlap logic under test stays genuine rather than
stubbed away. Only `pbCreate` is mocked from `./shared`; every other
helper there (`getWeekdaysInMonth`, `localShiftDate`, `formatMoney`) is
kept real since they're pure.

Covered: `no_clock_in` / `under_4_hours` / `inactivity` classification
(including that inactivity requires ONE continuous 37+ minute run, not
several shorter gaps summing past it), the Pakistan-only/USA-excluded
rule, the approved-leave override (suppresses a would-be absence
regardless of hours worked), the `exemptFromAbsenceCheck` and
pre-`joinedDate` guards, and dedup against existing absence history
(active or soft-deleted).

**Not covered, deliberately** (per this plan's own invitation to scope
narrower and document rather than force something contrived): the
concurrency/race-condition handling around `runAbsenceCheck`'s fresh
re-fetch-before-create step (two dashboards racing) — that needs a real
database's unique index to actually race against, which is an
integration-test concern, not something a mock-based unit test can
honestly exercise. Also not covered: the weekend/pre-join self-healing
cleanup sweeps at the top of `runAbsenceCheck` (secondary safety nets
reversing already-bad historical data, not the core classification logic
this plan prioritizes) and `getShiftShortfallDeduction`/
`getAbsenceDeductionForMonth` in `payroll.ts` (the partial-shift-shortfall
and absence-dollar-amount math layered on top of `runAbsenceCheck`'s
reason detection — real logic, but one layer removed from the five named
areas in this plan's Steps; a reasonable follow-up, not force-fit here).

**Red/green bug-injection proof (mandatory verification step)**: a
one-line bug was deliberately introduced into `computePayrollView`'s
mid-month-joiner proration — `daysWorkedInMonth = totalDaysInMonth -
joinDayOfMonth + 1` changed to `... - joinDayOfMonth` (dropping the `+1`,
an off-by-one in the day-count). Re-running `npx vitest run
src/lib/hr/payroll.test.ts` immediately went red — 2 of 9 tests failed
with the exact expected/received mismatch (`expected 24000 to be 25000`
and `expected 10000 to be 11000`, both off by exactly one day's pay at the
daily rate). The change was then reverted (`git checkout --
src/lib/hr/payroll.ts`) and the full suite (`npm test`, all 4 files) was
confirmed green again — 45/45 passing — with `npx tsc --noEmit` still
clean and `git status` showing no leftover diff. This is the concrete
proof the tests aren't trivially passing.

**CI wiring (step 6): done.** `.github/workflows/run-tests.yml` runs
`npm ci` -> `tsc --noEmit` -> `npm test` on every push/PR to `main`,
matching this repo's existing workflow style (plain `actions/checkout` +
`actions/setup-node`, a comment block explaining what it does and why —
see `build-tracker-agent.yml`/`deploy-pb-hooks.yml`). Wired in last, only
after the full suite ran green multiple consecutive times locally and the
bug-injection proof above held up — judged stable enough to gate merges
on, not flaky.

**Scope note**: exactly the 5 areas named in this plan's Steps got real
test coverage (payroll math, absence-reason detection, leave-day math,
NY-timezone utilities, plus the anniversary-increment/currency-separation
sub-requirements under payroll). No React component tests, no Playwright/
end-to-end tests, and no production logic was changed to make anything
"more testable" — the one honest exception being the absence-detection
suite's `vi.mock` boundary choices, which are test-side only.

