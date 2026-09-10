# 026 — Auto-retire previous-month attendance (absence) records, without breaking Insights

- **Status**: TODO
- **Commit**: (none yet — planning only)
- **Severity**: MEDIUM
- **Category**: Data lifecycle / storage hygiene (requested directly, not from the 10-category audit)
- **Estimated scope**: small-medium. New retention sweep modeled directly on the
  existing `screenshots-retention` route; a new small aggregate collection;
  one change to how `admin/insights` reads older months.

## Problem

You asked for previous month's attendance (absence) records to auto-delete
themselves 10 days into the new month. Earlier in this engagement I flagged
a real conflict and you asked me to hold off: `admin/insights/page.tsx`
(plan 007's Analytics Insights dashboard) reads raw `AbsenceRecord`s across
a rolling 6-month window (`lastNMonthKeys(6)`, `absenceRecords.filter(a =>
a.date.startsWith(month)).length` per month) to draw its absence trend
chart. If last month's raw records are gone 10 days into this month, that
chart loses 5 of its 6 months almost immediately, and keeps losing the
next month every month going forward — the trend chart would never show
more than about 1 real month of data.

There's also an existing precedent worth reusing rather than reinventing:
`hr_screenshot_retention_state_v1` / `src/app/api/tracking/screenshots-retention/route.ts`
already implements exactly this shape of feature for tracker screenshots —
a fire-and-forget sweep triggered from `admin`/`hr` page load (no server
cron in this app), a KV-tracked "have I already run this period" state, a
warning period before deletion, and a per-employee `excludeFromAutoDelete`
override. Absence records also already have a soft-delete tombstone
(`AbsenceRecord.deleted`/`deletedAt`, used today by HR manually dismissing
a wrongly-flagged record) — but `hrActions.getAbsenceRecords()` (what
Insights reads) already filters `deleted = false`, so soft-deleting on a
schedule would hit the exact same problem as hard-deleting: Insights would
still lose the underlying counts.

## Target

- 10 days into a new calendar month, every `AbsenceRecord` whose `date`
  falls in a month that is now more than 1 full month old is retired
  (soft-deleted via the existing `deleted`/`deletedAt` fields — no new
  hard-delete path, consistent with how HR already removes individual
  records today).
- Before any record is retired, its numbers are folded into a new small
  per-employee, per-month aggregate row (counts by reason, total
  deduction) in a new `hr_absence_monthly_summary` collection — so the
  underlying facts survive even though the row-level records don't.
- `admin/insights`'s absence trend chart is updated to read raw records
  for the most recent (not-yet-retired) month(s) and the new monthly
  summary rows for anything older — so the 6-month trend keeps working
  exactly as it does today, with identical numbers, regardless of which
  months have had their raw rows retired.
- Nothing else that reads `AbsenceRecord`s changes: `computePayrollView`
  only ever looks at the current/immediately-prior month (see its own
  1-3-day processing window), which is always safely inside the 10-day
  retention grace period, so payroll math is unaffected.

## Repo conventions to follow

- Model the sweep itself directly on
  `src/app/api/tracking/screenshots-retention/route.ts`: superuser
  (`pbAdmin.ts`) route, `adminGetKV`/`adminSetKV` for "have I already run
  this month" state (e.g. `hr_absence_retention_state_v1`), triggered
  fire-and-forget from `admin`/`hr` page load the same way
  `hrActions.checkScreenshotRetention()` is today (a new
  `hrActions.checkAbsenceRetention()` alongside it) — do not add a real
  server cron job, this app doesn't have one and this plan shouldn't be
  the one to introduce that infrastructure.
- Reuse the existing `deleted`/`deletedAt` tombstone fields for the
  retirement step itself — do not add a second, competing soft-delete
  mechanism.
- The new `hr_absence_monthly_summary` collection should be superuser-only
  write (via `pbAdmin.ts`), same lockdown posture plan 012 is establishing
  for every other collection — do not ship it publicly writable even
  though it's aggregate, non-personal-looking data, since it's still
  derived from real employee absence/pay records.
- Keep the currency/region discipline `admin/insights` already documents in
  its own header comment (USA and Pakistan money are never summed) — the
  new summary rows should carry `region` (or be scoped by it) so the
  aggregated data can still respect that rule once raw records are gone.

## Steps

1. Create the `hr_absence_monthly_summary` collection: `employeeEmail`,
   `month` (`YYYY-MM`), counts per reason (`noClockInCount`,
   `inactivityCount`, `underFourHoursCount`), `totalDeductionAmount`,
   `region`. One row per employee per month.
2. Add `hrActions.checkAbsenceRetention()` (mirrors
   `checkScreenshotRetention()`): on `admin`/`hr` page load, once per
   calendar month, call a new superuser API route.
3. New route `src/app/api/tracking/absence-retention/route.ts` (or
   alongside the existing `hr_absence_records` actions): find
   `AbsenceRecord`s whose month is more than 1 full month old and where
   today is 10+ days into the current month; for each employee/month
   group not yet summarized, write/upsert the aggregate row into
   `hr_absence_monthly_summary`; then soft-delete (`deleted: true,
   deletedAt`) the underlying raw records for that employee/month, the
   same way `bulkDeleteAbsenceRecords` already does.
4. Notify admin/HR after a sweep runs, same pattern as the screenshot
   sweep's `adminAddNotification` calls (e.g. "Attendance records for
   <month> were summarized and archived per the 10-day retention
   policy.").
5. Update `admin/insights/page.tsx`'s `absenceLeaveByMonth` computation:
   for each of the 6 months in `lastNMonthKeys(6)`, use the raw
   `absenceRecords` count if that month hasn't been retired yet, else
   read the count from `hr_absence_monthly_summary` for that
   month — one extra fetch alongside the existing
   `hrActions.getAbsenceRecords()` call, no change to the chart's
   rendering logic itself.
6. Confirm `computePayrollView` and the employee-facing
   `useMyAbsenceRecords`/salary "why was I deducted" list are unaffected
   — both only ever look at the current/prior month, which stays inside
   the 10-day grace window at all times.

## Boundaries

- Do NOT hard-delete any `hr_absence_records` row — retirement is the
  existing soft-delete tombstone, never a real PocketBase delete, so the
  data is still recoverable by a superuser if something goes wrong.
- Do NOT change `computePayrollView`, its 1-3-day processing window, or
  any already-stored `PayrollRecord` — this plan only touches how long
  raw absence rows stick around after payroll has already consumed them.
- Do NOT change what `AbsentPopup`/the employee-facing absence UI shows
  for the current or immediately-prior month — those stay backed by raw
  records exactly as today, since they're always inside the 10-day grace
  window.
- Do NOT retire a month's records before that month's payroll has actually
  been processed — if payroll processing is ever late or skipped for a
  given month, the sweep must skip retiring that month rather than
  guessing from the calendar date alone (check `PayrollRecord.processed`
  for that employee/month before retiring their absence rows for it).

## Verification

- **Mechanical**: `npx tsc --noEmit -p tsconfig.json` clean.
- **Manual**: seed a test absence record dated 2+ months ago, run the
  sweep, confirm a `hr_absence_monthly_summary` row appears with matching
  counts/deduction total, and the raw record is soft-deleted (`deleted:
  true`) but still present in
  `getAllAbsenceRecordsIncludingDeleted()`.
- **Manual**: open `admin/insights` before and after a sweep and confirm
  the absence trend chart's 6-month bars show identical values in both
  cases — the retirement should be invisible to that chart.
- **Manual**: confirm payroll processing and the employee salary
  "why was I deducted" list for the current/prior month are unaffected by
  a sweep run.
- **Done when**: attendance records older than 1 month are automatically
  summarized and soft-deleted 10 days into the new month, the Insights
  trend chart's numbers are unchanged before and after, and nothing else
  that reads absence data (payroll, employee salary view) is affected.
