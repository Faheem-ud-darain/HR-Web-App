# 007 — Admin/HR Analytics Insights page

- **Status**: TODO
- **Commit**: 59a9c20
- **Severity**: MEDIUM (feature gap, not a defect)
- **Category**: Feature / Data visualization (not part of the animation audit — uses the `dataviz` skill, tracked here only because this repo already keeps its planning docs in `plans/`)
- **Estimated scope**: 1 new page + 1-2 new small chart components, ~300-500 lines. No schema changes, no new API routes — reads entirely from existing hooks.

## Problem

Admin and HR currently have no visual analytics anywhere in the app. Every
number that matters for spotting a trend — payroll cost, absences, leave
usage, headcount — only exists as:

- Tables (`src/app/(dashboard)/admin/reports/page.tsx`, `hr/payroll/page.tsx`,
  `admin/payroll/page.tsx`, `AbsenceDetailsView.tsx`)
- One-off stat tiles (single numbers, no history — e.g. `admin/page.tsx`'s
  dashboard cards)
- Hand-rolled bar visualizations with plain `<div>`s, not a real chart system
  (`src/components/ui/EmployeeActivityInsights.tsx`, `ActiveEmployeesCard.tsx`)
  — and even these only cover tracking/activity data, not payroll, absences,
  or leave.

No chart library is installed (`package.json` has no recharts/d3/chart.js/
visx), confirmed by grep across `src`.

Effect on the product: HR/Admin have to mentally aggregate table rows to
answer "is payroll trending up?", "are absences worse this month than last?",
"how much unpaid PTO/leave liability is sitting on the books?" — questions a
chart answers in one glance, a table does not.

## Target

A new **Insights** page under `(dashboard)/admin/insights` (and, if useful,
mirrored read-only for `hr/insights` — see Steps) containing 3-4 charts built
per the `dataviz` skill's method (form heuristic, palette formula, mark specs,
interaction rules — load that skill before writing any chart code):

1. **Payroll cost over time** — a line or area chart, one series per region
   (USA / Pakistan), monthly, built from `hr_payroll` records already fetched
   by `usePayroll()`. X-axis: month (`PayrollRecord.month`). Y-axis: net payout
   (`baseSalary + bonus - deductions + incrementAmount`), summed per region
   per month.
2. **Absence & leave trend** — a stacked bar or grouped bar, monthly, showing
   count of absence records (`getAbsenceRecords()`/`useLeaves()` filtered by
   month) broken down by Urgent Leave / Normal Leave / unexplained absence
   (no_clock_in / under_4_hours / inactivity, collapsed to one "Absence"
   category — see `AbsenceRecord.reason`).
3. **Headcount by region** — a simple donut or bar, current snapshot, from
   `useProfiles()` grouped by `region`.
4. *(Stretch, only if 1-3 ship cleanly)* **Pending arrears / reserved salary
   liability** — a small stat callout (not necessarily a chart) summing
   `PayrollRecord.pendingArrears` and `reservedSalaryBalance` across all
   employees, so Admin can see outstanding liability at a glance — this
   directly follows up on the arrears work already done in
   `computePayrollView` (see `src/lib/hrData.ts`'s `pendingArrears` field).

All charts must follow this app's existing look: Tailwind slate/orange palette
(see `Card`/`CardContent` usage throughout `hr/payroll/page.tsx` for the
established stat-tile visual language), light/dark not required (app is
light-mode only today — confirm this hasn't changed before assuming otherwise).

## Repo conventions to follow

- Data access: use the existing React Query hooks (`useProfiles`, `usePayroll`,
  `useLeaves`, `useTimesheets`, `hrActions.getAbsenceRecords()`) exactly as
  `hr/payroll/page.tsx` does — do not add new API routes or new PocketBase
  reads. All aggregation (grouping by month/region) happens client-side in the
  new page, same pattern as `computePayrollView` in `src/lib/hrData.ts`.
- Page shell/layout: follow `src/app/(dashboard)/admin/reports/page.tsx` for
  header/search-bar/Card layout conventions (`Card`, `CardContent` from
  `@/components/ui/Card`).
- Sidebar entry: add a nav item the same way existing dashboard sections are
  registered in `src/components/layout/Sidebar.tsx` (find the existing
  `admin`/`hr` nav item arrays and follow that exact pattern — icon from
  `lucide-react`, route string, label).
- RBAC: gate the route the same way `(dashboard)/layout.tsx` already gates
  `/admin` vs `/hr` vs `/employee` via `dashboardSectionForRole()` — do not
  invent a new permission check.
- Charting: no library is installed. Before choosing one, check whether the
  `dataviz` skill recommends a specific approach for this stack (Tailwind,
  no existing chart lib) — it may recommend inline SVG (matching how
  `EmployeeActivityInsights.tsx` already hand-rolls bars) rather than pulling
  in recharts/visx as a new dependency. Prefer inline SVG/CSS if the skill's
  guidance and this app's "no new dependencies without reason" pattern (see
  `STANDARDS.md`) both point that way; only add a charting dependency if the
  skill's guidance makes a strong case a hand-rolled chart can't meet (e.g.
  real tooltips/hover-to-inspect on a line chart with many points).

## Steps

1. Load the `dataviz` skill and read its palette/method reference before
   writing any chart code.
2. Read `src/app/(dashboard)/admin/reports/page.tsx` in full for the page
   shell pattern (header, Card grid, search/filter bar) to imitate.
3. Read `src/components/ui/EmployeeActivityInsights.tsx` in full — it's the
   closest existing precedent for a hand-rolled chart in this codebase's
   visual language; imitate its SVG/div structure and color usage rather than
   inventing a new visual style.
4. Create `src/app/(dashboard)/admin/insights/page.tsx`:
   - Fetch `useProfiles()`, `usePayroll()`, `useLeaves()`,
     `hrActions.getAbsenceRecords()` (same one-time-fetch pattern
     `hr/payroll/page.tsx` uses for absence records — see its own comment on
     why it's not a React Query hook).
   - Aggregate payroll records by `month` + `region` into the series chart 1
     needs.
   - Aggregate leaves (`type === 'Urgent' | 'Normal'`, `status === 'approved'`)
     and absence records by month into the series chart 2 needs.
   - Group profiles by `region` for chart 3.
   - Render the 3 (or 4) charts inside `Card`s, following the reports page
     layout.
5. Register the new route in `src/components/layout/Sidebar.tsx`'s admin nav
   array (and hr nav array, if mirroring — confirm with whoever reviews this
   plan before doing the HR mirror; it may be Admin-only for v1).
6. If RBAC gating in `(dashboard)/layout.tsx` needs an explicit new path
   check (unlikely, since `/admin/*` and `/hr/*` are already gated by
   prefix), verify `/admin/insights` and (if added) `/hr/insights` fall under
   the existing prefix checks without a new special case.

## Boundaries

- Do NOT add a new PocketBase collection or API route — this is a read-only
  view over data every other payroll/absence page already fetches.
- Do NOT touch `computePayrollView` or any payroll math — this plan only
  reads/aggregates already-computed values, it doesn't change how they're
  computed.
- Do NOT add a charting dependency without first checking whether inline
  SVG (matching `EmployeeActivityInsights.tsx`) meets the need — see Repo
  conventions above.
- Do NOT touch the animation plans in this same `plans/` folder (001-006) —
  unrelated work, different audit.
- If HR should NOT see company-wide payroll totals for USA + Pakistan
  combined (a policy question, not a code question), stop and ask before
  mirroring this page under `hr/insights` — ship Admin-only first if unsure.

## Verification

- **Mechanical**: `npx tsc --noEmit -p tsconfig.json` — zero errors.
- **Manual**: log in as Admin, open `/admin/insights`, confirm:
  - Payroll chart shows one line/area per region, values roughly match the
    sum of `hr/payroll` and `admin/payroll` table rows for the same months.
  - Absence/leave chart's monthly totals match `AbsenceDetailsView.tsx`'s own
    per-month counts for a spot-checked month.
  - Headcount chart's total matches `useProfiles()`'s employee count.
  - Page respects the same RBAC redirect behavior as every other `/admin/*`
    route (an `hr`-role or `employee`-role session gets redirected away, same
    as visiting any other admin-only page today).
- **Done when**: the page renders real, correct numbers from live data with
  no console errors, and a non-technical HR/Admin user can answer "is payroll
  trending up this quarter?" by looking at the page for a few seconds,
  without opening a table.
