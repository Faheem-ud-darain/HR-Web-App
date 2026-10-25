# 028 — Simplify the Payroll tab for HR and Admin

- **Status**: PLAN — requirements agreed in discussion (see "Agreed requirements"); no code written; do not start building until told
- **Commit**: 6294754
- **Scope**: `src/app/(dashboard)/hr/payroll/page.tsx` (527 lines), `src/app/(dashboard)/admin/payroll/page.tsx` (507),
  `src/components/ui/NetPayableModal.tsx` (132), `src/lib/core/payroll.ts` (368, math stays untouched), new payroll components,
  plus the `hr_payroll` data model additions listed under "Data changes"
- **Out of scope**: the payroll math itself, the employee-facing salary page (decision pending), leave/absence rule changes

## Goal

An HR or Admin user opens Payroll and, within five seconds, can answer:

1. How much do we owe this month (per currency) and how much is already paid?
2. Who is unpaid, and is every record **correct enough to pay**?
3. For one person: the exact amount, the bank details, and *why* it is that amount.

## Agreed requirements

### Who does what

| Role | Can do |
|---|---|
| **HR** | Prepare and check the month, answer employees' salary queries, add bonus/deduction adjustments (with a reason), create corrections, optionally tick "Reviewed". Sees paid/unpaid status. **Cannot mark anyone paid.** |
| **Admin** | Everything HR can, plus pays: sends the money from their own account outside the app, then marks people **Paid** (one, several or all). The only payer — there is no finance role for now. |

Each payment stores who marked it paid and when (automatic, no typing needed). Bank name and account/IBAN are **read from the employee's profile** — nobody types them into payroll; a missing one is a readiness flag.

Admin may pay at any time — there is **no mandatory HR sign-off**. Instead the system must make sure the records are correct before money is sent (next section).

### Readiness checks (replaces manual approval)

Every person on the pay run gets a green tick or a red flag **before** Admin pays. Flags:

- Bank details missing from the employee's profile
- An earlier month is still unpaid
- A shift is still open, or was auto-closed by the tracker and nobody has reviewed it
- A leave request for the month is still pending
- A deduction/absence is not yet acknowledged or is awaiting a decision
- Net pay is zero, negative, or far from last month
- A correction on this month's record is not yet settled (informational: the settlement itself is separate from salary)
- **An open salary query from the employee** (see below)

Rules: a flagged person can still be paid, but only after Admin ticks "I have reviewed this" — that choice is stored. "Mark all as paid" lists the flagged people first and pays only the clean ones unless Admin chooses to include flagged ones. HR's optional "Reviewed" tick is an informational note and never blocks.

### Corrections after payment

A paid month is never edited in place. Instead:

- The **original paid amount stays unchanged**.
- A **correction** is added on top: corrected amount, the difference, a **required reason**, who made it, when.
- Status becomes **Paid — corrected**, with the difference visible ("PKR 4,000 still to pay" or "PKR 2,000 overpaid — to recover").
- The difference is **never added to or taken from the next month's salary**. Each month's salary stands on its own.
- Instead, every unsettled difference becomes an **outstanding settlement**, listed to Admin in a separate **"Outstanding settlements"** section (employee, month, amount owed or to recover, reason, date raised). Admin pays or recovers it when he chooses, outside the salary run, and marks it settled (stored with who and when). Salaries ignore settlements entirely; they are only shown, not calculated in.

### Deductions are explained in groups

Deductions come from several rules, so the screen shows them as groups, each with a total and an expandable list of the days behind it:

- **Hours** — worked less than the required hours (Remote only; On-site shows hours worked as information, no deduction)
- **Absence** — no clock-in, inactivity, under 4 hours (Remote only)
- **Leave** — urgent leave (2× daily rate), normal leave (1× daily rate) (both groups)
- **Other** — onboarding penalty (200 PKR / 10 USD), manual adjustment by HR

Overrides: HR/Admin can reduce or remove a calculated deduction only with a reason; the original calculated amount stays visible beside the change.

### Salary queries before payout (employee → HR)

Before the monthly payout, employees can ask HR to correct their salary. They do this with the ordinary **tickets** they already use; no new screen and **no button on each deduction line** — every deduction already shows its date and reason, so the employee can read it and mention the specific one in the ticket.

- The ticket form gets one optional field, **"About salary month"** (a month dropdown, shown for HR tickets). It stores a small topic tag (e.g. `salary:2026-10`). Needs one new text column on the tickets table; fallback if you prefer no schema change: a fixed title prefix such as `[Salary 2026-10]`.
- In Payroll, an employee with an **open salary ticket for that month** shows an "Open query" flag on their row and pay slip (link to the ticket). It is a readiness warning, so Admin sees it before paying.
- HR resolves it either by adjusting the amount (adjustment with reason, or a deduction override) or by replying that the figure is right, then closes the ticket; the flag clears.
- Queries are for **before** payout. After a month is marked Paid, a change goes through the **correction** record, and the employee sees "Paid — corrected" on their pay slip.

### Employee salary page (included in this plan)

Today it has: base-salary card, next-increment card, a reserved-balance banner, "Daily Deductions This Month", an 8-column "Historical Pay slips" table, and three modals (base breakdown, pending increment, official receipt).

**One shared component, reused for every employee.** A single `PaySlipView` takes one employee's payroll record and renders it. It is used:

- on the **employee's own Salary page** (their record),
- inside the **HR/Admin pay slip** (the same view of any employee's record, so HR sees exactly what the employee sees), and
- for both PKR and USD staff — differences come from the data (which deduction groups exist, whether hours are information only), never from a separate page or a copy of the layout.

Layout of the shared component:

- **Summary:** expected net pay, total deducted, pay status (`Not paid yet` / `Paid on …` / `Paid — corrected`). Base salary and increment details sit inside this block rather than separate cards and popups.
- **Deductions:** grouped (Hours, Absence, Leave, Other) with the date and reason behind each line. USD staff see hours worked as information only instead of the Hours and Absence groups.
- **Corrections:** the correction note, the original amount and the difference, when present.
- **Pay history** (employee page only): a short list — month, net, status; tapping a month opens the same component for that month; a receipt action stays.
- Reserved balance is a small note (employee page); it is not part of the monthly breakdown.

Employees raise questions through normal tickets (see above) — there is no per-deduction button. Optional, to decide: a single "Ask HR about this month" shortcut at the top of the summary, which opens a ticket pre-filled with the month.

### Month freeze and the pay window

- A payroll month is **calculated live while it is the current month**, then **frozen at midnight (New York time) on the 1st of the next month**. From that moment the system calculates the new month, and the frozen month no longer changes from attendance, leave or absence data. Only corrections (with a reason) can change a frozen month.
- Salaries are actually paid over days 3–5, so the frozen month stays **fully available for at least 10 days** (and for as long as anyone in it is still unpaid), so a late payment is easy to find and make.
- On the Payroll screen, days 1–10 (and any later day while someone is unpaid) the default view is the **frozen "Pay run" for last month**, with a tab for **"This month so far"** (live). Outside that window the default is the current month, and finished months sit in history. This replaces today's day-1–3 switch and the "Previous month" tab I built for days 4–10.
- Freezing stores the computed figures and the deduction breakdown on the payroll record, so pay slips show the same reasons later (the breakdown is not persisted today).
- **Dependency:** deductions for the last day of a month (absence checks, auto-closed shifts) are currently produced only when HR/Admin happens to open a dashboard. A freeze at midnight needs those finished first, so the plan includes a **scheduled server job** (see Increments) that runs the closing checks before it freezes.

### Increments are automatic

HR and Admin should not add or apply increments. The system applies the anniversary increment **by itself, by the existing rule** (flat amount per region, not compounding; the first payroll month it counts for is the month after the anniversary month):

- A scheduled job (daily, New York time) finds employees whose increment is due, raises their base salary and records the processed year (idempotent — running twice changes nothing), and keeps a history entry (date, amount, old and new base).
- **No backfill.** The job only applies increments that fall due from its first run onward. Employees who already have missed increments today (for example Anain and Alex) are **left exactly as they are**; they are listed under "Increments needing a decision" for Admin to handle by hand. The job never guesses back pay.
- **Changed salary start date:** when an employee's salary start date is set or changed, the next increment is due on **the same day one year later** (and yearly after that). The job uses that date, not the joined date, from then on.
- On the pay slip the increment appears as its own line ("Anniversary increment +X, effective from this month"); HR and Admin can see it but there is no button, field or step for it in Payroll. Mark as paid no longer changes base salary.
- Safeguards: a dry-run view showing who will get what (and who is skipped) before the job's first live run, and a manual "exceptions" note only for special cases (for example a changed start date), not for routine use.

### Notifications

The employee is notified (in-app and push) when their month is **marked paid** and when a **correction** is made, with the amount and the reason. HR/Admin get none of this noise.

### Exports (both)

- **Bank transfer sheet** (for Admin when paying): only the ready, unpaid employees; name, bank, account number/IBAN, net amount, currency; one file per currency.
- **Full payroll report**: everyone in the month — base, increment, bonus, deductions by group, net, status, paid date and who paid.

### Two workforces, two views

Verified in `core/payroll.ts` / `hr/absences.ts`:

| | Remote — Pakistan, PKR | On-site — USA, USD |
|---|---|---|
| Attendance | Tracker app + manual shifts | GPS geofence, automatic |
| Hours / absence / inactivity deductions | Yes | **No** — geofence attendance only *measures time* for now; it never reduces pay |
| Leave deductions | Yes | Yes |
| Onboarding penalty | 200 | 10 |
| Anniversary increment | +10,000 / year | +100 / year |

**USD attendance rule (decided):** for now the geofence only calculates the time worked. It produces **no deductions**. The On-site pay slip shows hours worked per day/month as information only. If a rule that uses those hours to reduce pay is wanted later, it is a separate change to `core/payroll.ts`, not part of this plan.

The screen has two views of the same component, **Remote (PKR)** and **On-site (USD)**, each with its own totals and only the deduction groups that apply to it. Currencies are never added together.

### Reserved salary

Not in the monthly list. It appears in a **separate "Reserved balances" section** (both groups, per currency): one row per employee with the held amount, when it was added, and its history. It is also shown inside the **offboarding final settlement**, next to the leftover-leave payout, so the final payment is one number. In the monthly list a first-month hold shows only as a small chip.

## What is complicated today (verified)

| # | Problem | Where |
|---|---|---|
| 1 | HR table has **10 columns** (1300px min width); Admin's has 5. Two models for the same data. | HR table; Admin `page.tsx:275` |
| 2 | One action, four names: "Complete Payout" / "Mark as Paid" / "Release Monthly Funds"; status "Completed"/"Processed"/"Paid"/"Released". | both pages, `NetPayableModal.tsx` |
| 3 | "Net Payable" is both a column header and a button. | HR table |
| 4 | "Bonus ($)" / "Deductions ($)" headers for mostly-PKR staff. | HR headers |
| 5 | "Onboarding Penalty" column holds unpaid-leave days. | HR table |
| 6 | Totals exclude the increment while rows include it, so cards and rows disagree. | total cards, Admin `grandNetUSD` |
| 7 | Bonus/deductions write to the database on **every keystroke** (no Save/undo). | `handleUpdateAmount` |
| 8 | HR's "Complete Payout" has no confirmation and silently changes base salary and reserve. | `handleProcess` |
| 9 | Row noise: arrears notes, rebate labels, itemised deductions, reserved text. | row cells |
| 10 | Five competing header controls. | HR header |
| 11 | Payout and row code duplicated 4× (two pages × desktop/mobile). | both pages |
| 12 | Payroll recomputed in the page body on every render (HR not memoised). | HR `compiledPayrollData` |
| 13 | **No check that records are correct before paying**, and no way to correct a paid month. | whole flow |

## Target design

**Header** — view switch `Remote (PKR) | On-site (USD)`; month switch `Pay run: October (frozen) | This month so far` (see "Month freeze and the pay window"; the interim "Previous month" tab for days 4–10 is replaced by this); one search box; one filter `All · Unpaid · Paid · Needs attention`; Export CSV. Refresh becomes a small icon button.

**Three summary cards** (per currency of the selected view): **To pay** (includes increments — one definition everywhere) · **Progress** ("7 of 14 paid") · **Ready to pay** ("11 ready, 3 flagged").

**List — 5 columns** (same fields as a mobile card):

| Employee | Net pay | Status | Flags | Action |
|---|---|---|---|---|
| name, role | one number, own currency | `Unpaid` / `Paid` / `Paid — corrected` | chips: Increment · Deductions · Arrears · No bank details · Needs review | `Review` |

**Pay slip** (replaces `NetPayableModal` and all inline editing), top to bottom: net amount + status → bank details with copy buttons → plain breakdown (Base · Increment · Bonus · grouped deductions · = Net) → readiness checks for this person → adjustments (bonus/deduction + reason, explicit **Save**) → corrections history → **Mark as paid** with a confirmation that lists its effects (amount, who is paid, and any first-month reserve being held). It no longer changes base salary — increments are automatic.

**Admin pay run panel**: "Mark all as paid" for ready employees — shows count and total per currency, lists flagged people, requires confirmation. Department breakdown (Admin) becomes a collapsed section.

**Wording rule**: one verb, one status — **Mark as paid** → **Paid**. Retire "Complete Payout", "Release Monthly Funds", "Processed", "Completed".

## Data changes (to be confirmed before building)

The live `hr_payroll` table has no room for these; they need either new columns or a small new collection (decide in Phase 0):

- `paidBy`, `paidAt` (who and when marked paid — automatic)
- tickets: a small `topic` text field (e.g. `salary:2026-10`) linking a salary query to a pay month
- corrections: `correctedAmount`, `difference`, `reason`, `correctedBy`, `correctedAt`, `settledAt`, `settledBy` (empty until Admin settles it) — one row per correction, so history is kept
- adjustment reason for bonus/manual deduction
- freeze: `frozenAt` and the stored `breakdown` (deduction groups with reasons) on the payroll record
- increment history (date, amount, old base, new base, employee) so automatic changes are auditable
- "reviewed anyway" acknowledgement per flagged person

## Phases (each shippable alone)

**Phase 0 — Safety net, no visible change.** Pin `computePayrollView` results with tests for ~6 fixture employees (late joiner, increment due, absence deduction, first-month reserve, USA, prior-month arrears). Decide the data-model approach. Nothing below may change these numbers.

**Phase 1 — Wording and consistency.** One verb/status vocabulary, currency-correct headers, rename "Onboarding Penalty", one net formula (including increments) for rows, cards, CSV; add the confirmation to HR's payout.

**Phase 2 — Remove duplication.** One `markPayrollPaid` function; one memoised `usePayrollView`; one `PayrollList` for desktop and mobile.

**Phase 3 — Two views and a simple list.** Remote/On-site views, 5-column list, summary cards, filters, "Needs attention".

**Phase 3b — Scheduled payroll jobs and freeze.** Server-side jobs on Cloudflare (cron Worker → `/api/cron/*` routes, shared secret): a daily job runs absence/stale-shift closing, applies due increments (no backfill; history kept), and freezes last month at midnight NY on the 1st (stores figures and breakdown). A light 15–30-minute job (pending decision) closes abandoned shifts and raises capture-gap alerts. Includes a dry-run and a manual "run now" for Admin. Needs a Worker deploy to your Cloudflare account and one shared secret, not a droplet deploy.

**Phase 4 — Readiness checks.** The check engine (pure, tested), flags in list and pay slip, "reviewed anyway" acknowledgement, bulk-pay behaviour for flagged people.

**Phase 5 — Shared pay slip, adjustments, corrections.** Build `PaySlipView` as one shared component (grouped deductions, reasons, corrections), Save-based adjustments with reasons, deduction overrides with original shown, correction record and "Paid — corrected" status, settlement choice.

**Phase 6 — Reserved balances and offboarding.** Separate "Reserved balances" section (both currencies) and reserve inside the offboarding final settlement.

**Phase 7 — Salary queries and the employee salary page.** "About salary month" field on the ticket form, the "Open query" flag in Payroll, and the employee Salary page rebuilt on the shared `PaySlipView` (the same component the HR/Admin pay slip uses since Phase 5).

**Phase 8 — Admin extras, notifications, exports and polish.** Paid/corrected notifications to employees, the two exports, pay-run panel, collapsed department breakdown, empty/loading states, accessibility, mobile pass.

**Phase 9 — Verification and rollout.** `tsc`, ESLint, vitest (incl. Phase 0 pins), `next build`; browser walkthrough as HR and Admin, read-only on production, writes only on a dedicated test account; one commit per phase.

## Decisions closed in discussion

- Salary queries stay open until the month is marked paid.
- Queries are linked to a month with a small `topic` field on tickets; employees use the normal ticket form only (no extra shortcut button).
- Corrections create outstanding settlements shown to Admin; nothing is carried into next month's salary.
- Scheduled jobs run on **Cloudflare**: a thin cron Worker calls authenticated API routes (`/api/cron/daily`, optionally `/api/cron/frequent`) that hold the tested TypeScript logic and talk to PocketBase with the existing admin secret. No new droplet hook.
- A changed salary start date moves the next increment to the same day one year later.
- Employees already behind on increments are left alone; no backfill.
- No finance role: Admin is the only payer; HR cannot mark paid.
- Bank details come from the employee profile; no bank reference field, paid date/time is recorded automatically.
- The employee salary page is included (Phase 7).
- Employees are notified when paid and when corrected; both exports are provided.
- Increments are applied automatically by rule; HR/Admin never add them.
- A month freezes at midnight NY on the 1st of the next month and stays available for at least 10 days (and while anyone is unpaid).
- USD geofence calculates time only; no USD attendance deductions for now.

## Progress

- **Phase 0 — done** (`payrollPins.test.ts`, 14 pins).
- **First version of the new screen — done, not deployed.** HR and Admin now share `components/payroll/PayrollScreen.tsx` with three tabs: *Salaries* (Pakistan/USA switch, money-left-to-pay / paid-so-far / needs-a-look cards, everyone / not paid / paid / needs-a-look filter, one "amount to pay" figure that includes increments), *Held salary*, *Past months*. The pay slip (`PaySlipDialog.tsx`) shows the bank details with copy buttons, the deductions in plain groups, and a bonus box with an explicit Save. Only Admin can mark paid (one person, or "Mark all ready as paid" with a count and total). Exports: bank transfer sheet (Admin) and full report. The old `NetPayableModal` and the 10-column HR table are gone. Pure rules live in `core/payrollView.ts` (tested).
- **Known gaps for the next steps:** manual deductions are not editable (the old boxes never persisted, because the deductions are recalculated each time); corrections after payment, the month freeze, automatic increments, outstanding settlements and salary-query flags are still to build. Mark-as-paid still adds the pending increment to base salary until the automatic job exists.

## Open questions

None blocking Phase 0–3. Possible further topics: bonus approval, what Team Leads can see, the offboarding final settlement layout, history/audit view.

## Risks

- **Money logic must not drift** → Phase 0 pins; `core/payroll.ts` math is not edited by this plan.
- **Production writes** → tests only on a dedicated test account; new confirmations reduce accidental payouts.
- **Schema changes on a live PocketBase** → additive columns/collection only, created through the existing schema-migration route, nothing removed.
- **Readiness checks too strict** → every flag is overridable with a recorded acknowledgement; thresholds are constants in one file.

## Done when

- HR and Admin use one screen with Remote and On-site views; a new user can find "who is unpaid" and "pay this person" without guidance.
- Each list has at most 5 columns and one name per action/status.
- Rows, cards, CSV and pay slip show the same net number for everyone.
- Nothing is saved except by an explicit Save, Mark as paid, or correction.
- Admin cannot unknowingly pay a flagged record, and every payment records who and when.
- A paid month can be corrected with a visible "corrected" note and the original amount preserved.
- All tests pass and the Phase 0 pins are unchanged.
