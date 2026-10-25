// Plain TypeScript — no React, no 'use client', no PocketBase client. Safe to
// import from the browser, Next route handlers and the Edge runtime alike.
// Anything time-dependent takes an injectable `now` so it is unit-testable.
import { getNYDateString } from '../timezone';
import type { Profile, LeaveApplication, TimesheetEntry, PayrollRecord, AbsenceRecord } from '../hr/types';
import { getWeekdaysInMonth, isWeekday } from './dates';
import {
  getApprovedLeaveOnDate, isApprovedLeaveOnDate, getApprovedLeaveDaysInMonth,
  getRemainingPTO, getPTOAccrualDate,
} from './leaves';
import { getPendingIncrementForPayrollMonth } from '../incrementMath';
import { elapsedMinutes } from './timesheets';
import { monthLabel } from './payrollView';

// Standard full shift length — a day worked for this many minutes (8h)
// earns the full daily rate; less than this (but at/above the 4h absent
// floor) earns a proportional fraction. Mirrors employee/page.tsx's own
// REQUIRED_SHIFT_MINUTES constant for the "End Shift" under-8-hours notice.
export const STANDARD_SHIFT_MINUTES = 8 * 60;

export function getFinalLeavePayout(profile: Profile, leaves: LeaveApplication[], now: Date = new Date()): number {
  const remainingDays = getRemainingPTO(leaves, profile.fullName, getPTOAccrualDate(profile), now);
  const dailyRate = profile.baseSalary / getWeekdaysInMonth(getNYDateString(now).slice(0, 7));
  return Math.round(remainingDays * dailyRate);
}

// Absence deduction for one employee's target month, recomputed from their
// CURRENT base salary — deliberately NOT a sum of each AbsenceRecord's own
// (frozen) `deductionAmount` field. That field is set once, at detection
// time, from whatever emp.baseSalary was that day (see runAbsenceCheck) and
// never revisited. If a salary was ever wrong in the system for a while
// (data-entry mistake, since-corrected) any absence recorded during that
// window kept charging 2x the OLD, much larger daily rate forever — this
// is how a 20,000 salary could show a 130,000 "absence deduction": a
// couple of leftover records from when the salary was mistakenly set much
// higher. Recomputing from count * current daily rate means a salary
// correction fixes every past absence deduction for that employee too, not
// just future ones. Shared by computePayrollView and the HR/Admin payroll
// pages' own "absence total" breakdown so both always show the same number.
// Never negative (a month can't have a negative absence count) — guarded
// anyway in case a bad/NaN baseSalary ever slips through.
export function getAbsenceDeductionForMonth(
  absenceRecords: AbsenceRecord[],
  employeeEmail: string,
  currentBaseSalary: number,
  monthKey: string,
  leaves: LeaveApplication[] = []
): number {
  const wanted = (employeeEmail || '').toLowerCase();
  const count = absenceRecords.filter(a => {
    if (a.employeeEmail.toLowerCase() !== wanted) return false;
    if (a.date.slice(0, 7) !== monthKey) return false;
    // Skip any absence record whose date turned out to be covered by an
    // approved leave — see getApprovedLeaveOnDate's comment. runAbsenceCheck
    // only checked leave status at scan time, so a leave approved afterward
    // leaves a stale 'no_clock_in'/'under_4_hours'/'inactivity' record
    // behind for what is actually now a leave day. That day is already
    // charged (at the correct Urgent/Normal rate, or not at all for
    // PTO/Sick/Parental) via the Urgent/Normal Leave deduction above —
    // counting it here too would double-charge the same day.
    if (getApprovedLeaveOnDate(leaves, a.employeeName, a.date)) return false;
    return true;
  }).length;
  const dailyRate = currentBaseSalary / getWeekdaysInMonth(monthKey);
  const raw = Math.round(count * 2 * dailyRate);
  return Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

// Shift-shortfall deduction — the "for each day divide their worked/onshift
// hours with the total shift hours to calculate their daily salary" half of
// the 2026-09-03 shift-pay formula. A day with a real shift that ran LESS
// than the standard 8 hours but still cleared the 4-hour absent floor
// previously cost nothing at all (only a full no-show/under-4h day did,
// via the flat 2-day absence penalty below/runAbsenceCheck). This closes
// that gap: for each such partial day this month, deduct the proportional
// shortfall — dailyRate * (1 - workedMinutes/480) — from pay. Deliberately
// scoped identically to runAbsenceCheck (Pakistan region only, not exempt,
// weekdays only, on/after joinedDate, skipped on approved-leave days) and
// deliberately SKIPS any date that already has an AbsenceRecord (that
// day's flat 2-day penalty already covers it — this must never double-
// charge the same day twice) and any date with zero recorded minutes
// (a true no-show is runAbsenceCheck's job, not this function's — it only
// prorates a shift that actually happened but ran short). Only counts
// dates through yesterday (today's shift may still be in progress).
export function getShiftShortfallDeduction(
  timesheets: TimesheetEntry[],
  absenceRecords: AbsenceRecord[],
  leaves: LeaveApplication[],
  profile: Pick<Profile, 'fullName' | 'email' | 'region' | 'joinedDate' | 'exemptFromAbsenceCheck'>,
  currentBaseSalary: number,
  monthKey: string,
  today: Date = new Date()
): number {
  if (profile.region !== 'Pakistan') return 0;
  if (profile.exemptFromAbsenceCheck) return 0;

  const todayStr = getNYDateString(today);
  const joinedStr = profile.joinedDate && /^\d{4}-\d{2}-\d{2}/.test(profile.joinedDate)
    ? profile.joinedDate.slice(0, 10)
    : '';
  const email = (profile.email || '').toLowerCase();
  const absentDates = new Set(
    absenceRecords.filter(a => a.employeeEmail.toLowerCase() === email && !a.deleted).map(a => a.date)
  );

  // Bucket every timesheet minute this employee worked by NY calendar day —
  // same shiftDate bucketing runAbsenceCheck uses, just for the whole month
  // instead of a 5-day lookback.
  const minutesByDate = new Map<string, number>();
  for (const t of timesheets) {
    if (!t.employeeEmail || t.employeeEmail.toLowerCase() !== email || !t.clockIn) continue;
    const d = new Date(t.clockIn);
    if (isNaN(d.getTime())) continue;
    const shiftDate = getNYDateString(d);
    if (shiftDate.slice(0, 7) !== monthKey) continue;
    const mins = elapsedMinutes(t.clockIn, t.clockOut);
    minutesByDate.set(shiftDate, (minutesByDate.get(shiftDate) || 0) + mins);
  }

  const dailyRate = currentBaseSalary / getWeekdaysInMonth(monthKey);
  const MIN_REQUIRED_WORK_MINUTES = 4 * 60;
  let totalShortfall = 0;

  for (const [dateStr, mins] of minutesByDate) {
    if (dateStr >= todayStr) continue; // today/future — shift may still be in progress
    if (joinedStr && dateStr < joinedStr) continue;
    if (!isWeekday(dateStr)) continue;
    if (absentDates.has(dateStr)) continue; // already flat-penalized by runAbsenceCheck — never double-charge
    if (mins < MIN_REQUIRED_WORK_MINUTES) continue; // that's runAbsenceCheck's job, not this function's
    if (mins >= STANDARD_SHIFT_MINUTES) continue; // full (or over) shift — no shortfall
    if (isApprovedLeaveOnDate(leaves, profile.fullName, dateStr)) continue;
    totalShortfall += dailyRate * (1 - mins / STANDARD_SHIFT_MINUTES);
  }

  const rounded = Math.round(totalShortfall);
  return Number.isFinite(rounded) ? Math.max(0, rounded) : 0;
}

// ── Payroll ───────────────────────────────────────────────────────────
// Computes the current payroll view for a set of employees (pure, no
// writes) — mirrors old db.getPayroll()'s calculation. Callers decide
// whether/when to persist via upsertPayrollRecord (e.g. only on "Process").
//
// `absenceRecords` is the real source of truth for no-call-no-show /
// inactivity deductions (the flat 2-day penalty). Deliberately NOT
// recomputed live from timesheets+leaves the way urgent-leave deductions
// are: absence detection needs a one-time historical scan (inactivity
// logs especially) and needs to persist a specific reason for the Absent
// Details pages, so runAbsenceCheck (below) creates a real AbsenceRecord
// once per absence, and this function just sums up whichever records
// already exist for the employee this month.
//
// `timesheets` (2026-09-03) now also feeds getShiftShortfallDeduction —
// the day-by-day worked-hours/8-hours proration for shifts that ran
// short of a full day without qualifying as absent (4h-8h range).
// Payroll is paid by an external process, so HR/Admin keep looking at last month's figures
// for the first PAYROLL_REVIEW_DAYS days of a month. Days 1–3 the main view already shows the
// previous month; days 4–10 it has moved on, so a separate "Previous month" tab offers it.
export const PAYROLL_REVIEW_DAYS = 10;
const PAYROLL_PROCESSING_DAYS = 3;

/** True when the previous month's payroll should be offered as its own tab (NY days 4–10). */
export function canReviewPreviousMonthPayroll(now: Date = new Date()): boolean {
  const day = parseInt(getNYDateString(now).split('-')[2], 10);
  return day > PAYROLL_PROCESSING_DAYS && day <= PAYROLL_REVIEW_DAYS;
}

/** "YYYY-MM" of the calendar month before `now`'s New York month. */
export function previousPayrollMonthKey(now: Date = new Date()): string {
  const [y, m] = getNYDateString(now).split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function computePayrollView(employees: Profile[], existingPayroll: PayrollRecord[], leaves: LeaveApplication[], timesheets: TimesheetEntry[] = [], absenceRecords: AbsenceRecord[] = [], now: Date = new Date(), previousMonth = false): PayrollRecord[] {
  const today = new Date(now);
  const dayOfMonth = parseInt(getNYDateString(today).split('-')[2], 10);
  
  // When payroll is accessed during the processing window (Days 1–3 of the month),
  // the target month being processed is the PREVIOUS month (e.g. Aug 1-3 processes July).
  const inProcessingWindow = dayOfMonth >= 1 && dayOfMonth <= PAYROLL_PROCESSING_DAYS;
  // `previousMonth` is only honoured outside the processing window (inside it the default already is last month).
  const targetMonthKey = inProcessingWindow || previousMonth
    ? previousPayrollMonthKey(today)
    : getNYDateString(today).slice(0, 7);

  return computePayrollForMonth(employees, existingPayroll, leaves, timesheets, absenceRecords, today, targetMonthKey);
}

// New joiners and their first pay (rule from the owner, Oct 2026):
//  - Joined on the 1st–5th: that month is the "first month" and is held back in full (reserved);
//    the next month is paid normally.
//  - Joined after the 5th (e.g. 15 Aug): the part-month pay (15–31 Aug) is set aside and paid together
//    with the salary two months later (October); the first FULL month (September) is the one held
//    back in full; October is paid normally plus the set-aside part-month pay.
// FIRST_MONTH_CUTOFF_DAY is the last day of the month that still counts as "joined at the start".
export const FIRST_MONTH_CUTOFF_DAY = 5;

const monthIndex = (key: string): number => {
  const [y, m] = key.split('-').map(Number);
  return y * 12 + (m - 1);
};
function addMonths(key: string, n: number): string {
  const idx = monthIndex(key) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

/** The payroll records for ONE calendar month (see computePayrollView for how that month is chosen). */
function computePayrollForMonth(employees: Profile[], existingPayroll: PayrollRecord[], leaves: LeaveApplication[], timesheets: TimesheetEntry[], absenceRecords: AbsenceRecord[], today: Date, targetMonthKey: string, resolveStub = true): PayrollRecord[] {
  return employees
    .filter(emp => emp.role === 'employee' || emp.role === 'team_lead')
    .map(emp => {
      // Scoped to THIS calendar month — see PayrollRecord.month's comment.
      // Without the month check this would match any row ever created
      // for the employee (there used to only ever be one), silently
      // reusing/overwriting a prior month's already-paid record instead
      // of starting a fresh one for targetMonthKey.
      const existing = existingPayroll.find(p => p.employeeId === emp.id && p.month === targetMonthKey);
      // Payroll-specific deferral — see getPendingIncrementForPayrollMonth's
      // comment: an anniversary increment only starts affecting pay from
      // the calendar month AFTER the anniversary month, never the
      // anniversary's own month, regardless of when this is processed.
      const pendingIncrement = getPendingIncrementForPayrollMonth(emp, targetMonthKey);

      // 1. Calculate Base Salary for Current Month (Handling Mid-Month Joiners)
      let effectiveBaseSalary = emp.baseSalary;
      // True whenever targetMonthKey IS this employee's own first
      // calendar month of employment — drives the automatic first-month
      // salary reserve below (item 3), regardless of which day in that
      // month they actually joined.
      let isEmployeesFirstMonth = false;
      // New-joiner pay timing (see FIRST_MONTH_CUTOFF_DAY above).
      let isStubMonth = false; // the part-month pay of a late joiner is set aside this month
      let stubSource: { monthKey: string; day: number } | null = null; // this month ALSO pays that part-month pay

      if (emp.joinedDate) {
        // The joining date is a calendar date ("2026-08-15"), so read its year/month/day as written.
        // (It used to be parsed as midnight UTC and then shown in New York time, which is the evening
        // of the 14th — pay was counted from a day too early and a joiner on the 6th looked like the 5th.)
        const joinedDateObj = new Date(emp.joinedDate);
        const joinedParts = /^(\d{4})-(\d{2})-(\d{2})/.exec(emp.joinedDate);
        const joinedYear = joinedParts ? Number(joinedParts[1]) : Number(getNYDateString(joinedDateObj).slice(0, 4));
        const joinedMonthNum = joinedParts ? Number(joinedParts[2]) : Number(getNYDateString(joinedDateObj).slice(5, 7));
        const joinDayAll = joinedParts ? Number(joinedParts[3]) : parseInt(getNYDateString(joinedDateObj).split('-')[2], 10);
        const joinedMonthKey = `${joinedYear}-${String(joinedMonthNum).padStart(2, '0')}`;
        if (joinDayAll > FIRST_MONTH_CUTOFF_DAY) {
          const monthsSinceJoin = monthIndex(targetMonthKey) - monthIndex(joinedMonthKey);
          if (monthsSinceJoin === 1) isEmployeesFirstMonth = true; // the first FULL month is the one held back
          if (monthsSinceJoin === 2) stubSource = { monthKey: joinedMonthKey, day: joinDayAll };
        }

        // Check if employee joined in this current month
        if (joinedMonthKey === targetMonthKey) {
          const joinDayOfMonth = joinDayAll;
          // Joined at the start of the month: this month is held back in full. Joined later: only the
          // part-month pay exists this month and it is set aside (see isStubMonth below), not held.
          isEmployeesFirstMonth = joinDayOfMonth <= FIRST_MONTH_CUTOFF_DAY;
          isStubMonth = joinDayOfMonth > FIRST_MONTH_CUTOFF_DAY;

          // Rule:
          // - If joined in month's first 5 days (joinDayOfMonth <= 5): Processed normally with full base salary.
          // - If joined after a week (joinDayOfMonth > 5): Prorated for days worked, and carried over if unpaid.
          if (joinDayOfMonth > 5) {
            const totalDaysInMonth = new Date(joinedYear, joinedMonthNum, 0).getDate();
            const daysWorkedInMonth = totalDaysInMonth - joinDayOfMonth + 1;
            const dailyRate = emp.baseSalary / totalDaysInMonth;
            effectiveBaseSalary = Math.round(daysWorkedInMonth * dailyRate);
          }
        }
      }

      // 2. Urgent Leave Deductions — 2 days' pay deducted for EACH DAY of
      // Urgent leave taken (submitted any time, no advance notice), but
      // ONLY for the days of that leave that actually fall in
      // targetMonthKey — see getApprovedLeaveDaysInMonth's own comment:
      // this used to sum every approved Urgent leave day this employee
      // had EVER taken with no month filter at all, so one approved
      // Urgent/Normal leave request kept being deducted again every
      // single month forever instead of just the month it was taken in.
      const urgentDays = getApprovedLeaveDaysInMonth(leaves, emp.fullName, 'Urgent', targetMonthKey);
      const dailyRateForDeduction = emp.baseSalary / getWeekdaysInMonth(targetMonthKey);
      const rawUrgentDeduction = Math.round(urgentDays * 2 * dailyRateForDeduction);
      // Never negative — guards against a malformed `duration` string
      // (parseLeaveDates returning something that nets out negative/NaN)
      // silently turning into a negative "deduction" that would actually
      // increase pay.
      const urgentDeduction = Number.isFinite(rawUrgentDeduction) ? Math.max(0, rawUrgentDeduction) : 0;

      // 2b. Normal Leave Deductions — the PTO/Sick-Leave replacement
      // (see LeaveApplication.type's comment): requires 14 days' advance
      // notice (enforced client-side at submission, in employee/leaves),
      // deducts 1 day's pay for EACH DAY taken (half the Urgent-leave
      // rate, by design — parallel structure, different multiplier), same
      // per-month scoping as Urgent Leave above.
      const normalDays = getApprovedLeaveDaysInMonth(leaves, emp.fullName, 'Normal', targetMonthKey);
      const rawNormalDeduction = Math.round(normalDays * 1 * dailyRateForDeduction);
      const normalDeduction = Number.isFinite(rawNormalDeduction) ? Math.max(0, rawNormalDeduction) : 0;
      const onboardingPenalty = emp.onboardingCompleted ? 0 : (emp.region === 'USA' ? 10 : 200);

      // 3. Absence Deductions — see getAbsenceDeductionForMonth's own
      // comment for why this is recomputed from the employee's current
      // base salary instead of summing each record's frozen snapshot.
      const absenceDeduction = getAbsenceDeductionForMonth(absenceRecords, emp.email, emp.baseSalary, targetMonthKey, leaves);

      // 3b. Shift Shortfall Deductions — see getShiftShortfallDeduction's
      // comment. Covers the 4h-8h partial-shift range that absence
      // detection (< 4h only) never touched at all.
      const shiftShortfallDeduction = getShiftShortfallDeduction(timesheets, absenceRecords, leaves, emp, emp.baseSalary, targetMonthKey, today);

      // 4. Prior Month Unpaid Salary Arrears — informational only.
      // If this employee has other hr_payroll rows (any month besides
      // this one) still sitting `!processed`, sum what they'd have paid
      // out (baseSalary + bonus - deductions + incrementAmount) so HR/
      // Admin can see "there's still X unpaid from a prior month" and go
      // process that old record directly. Deliberately NOT added into
      // this month's baseSalary/deductions/net-pay — see
      // PayrollRecord.pendingArrears's comment for why folding it in used
      // to quietly inflate (and re-trigger absence-deduction confusion
      // on) the CURRENT month's numbers with a prior month's already-
      // settled deduction math. Each month's own effectiveBaseSalary
      // (this month's proration only) is what actually gets paid now;
      // pendingArrears is just a pointer at old unpaid rows, never a
      // second source of truth for what this month's pay is.
      const pendingArrears = existingPayroll
        .filter(p => p.employeeId === emp.id && !p.processed && p.id !== existing?.id)
        .reduce((acc, p) => acc + (p.baseSalary + p.bonus - p.deductions + p.incrementAmount), 0);

      // Combined deductions for the month — floored at 0 (a deduction can
      // never subtract a negative amount, i.e. add to pay) and capped at
      // this month's own base salary (effectiveBaseSalary — pendingArrears
      // is purely informational now and never enters this month's pay
      // math at all, so there's nothing else it could be capped against).
      // This is the
      // safety net for exactly the scenario that prompted it: a leftover
      // bad/stale deduction (or several) summing to far more than the
      // employee's actual salary and producing a nonsensical net pay.
      // It's a display/payroll-output safeguard, not a substitute for
      // fixing the underlying bad record(s) — if this cap is ever
      // visibly kicking in for a real employee, HR/Admin should still go
      // look at why (see getAbsenceDeductionForMonth's comment for the
      // most common cause).
      // 5. First-Month Reserve (item 3) — an employee's entire first
      // calendar month of pay is withheld rather than paid out, and
      // accumulates in their reservedSalaryBalance (see hr/payroll and
      // admin/payroll pages' handleProcess, which write that balance at
      // Process time) to be paid out only at resignation/termination.
      // Folded into combinedDeductions below so net pay for this record
      // already comes out to (at most) any carried-over arrears from
      // BEFORE this month — never this month's own base salary — without
      // needing a separate net-pay formula. See PayrollRecord.
      // reservedThisMonth's comment for why this isn't its own DB column.
      const reservedThisMonth = isEmployeesFirstMonth ? Math.round(effectiveBaseSalary) : 0;

      const rawCombinedDeductions = urgentDeduction + normalDeduction + absenceDeduction + shiftShortfallDeduction + onboardingPenalty + reservedThisMonth;
      let combinedDeductions = Number.isFinite(rawCombinedDeductions)
        ? Math.max(0, Math.min(rawCombinedDeductions, effectiveBaseSalary))
        : 0;

      // A late joiner's part-month pay is not paid now: whatever is left of it after this month's own
      // deductions is withheld here (so net pay is 0) and paid with the salary two months later.
      let deferredThisMonth = 0;
      if (isStubMonth) {
        const stubBase = Math.round(effectiveBaseSalary);
        deferredThisMonth = Math.max(0, stubBase - combinedDeductions);
        combinedDeductions = combinedDeductions + deferredThisMonth;
      }
      // …and two months after joining, that set-aside amount is added to this month's pay.
      let earlierPay = 0;
      let earlierPayLabel = '';
      if (stubSource && resolveStub) {
        const stubRecord = computePayrollForMonth([emp], [], leaves, timesheets, absenceRecords, today, stubSource.monthKey, false)[0];
        earlierPay = stubRecord?.deferredThisMonth || 0;
        const joined = new Date(Date.UTC(Number(stubSource.monthKey.slice(0, 4)), Number(stubSource.monthKey.slice(5, 7)) - 1, stubSource.day)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
        earlierPayLabel = `Part-month pay for ${monthLabel(stubSource.monthKey)} (joined ${joined})`;
      }

      // Itemized breakdown — "show the reason to employee and HR why
      // salary is deducted" (explicit product decision, 2026-09-03).
      // Same not-a-DB-column treatment as reservedThisMonth: recomputed
      // fresh from the pieces above rather than persisted. Deliberately
      // uses the RAW (pre-cap) per-item amounts, not a cap-scaled share —
      // if the safety-net cap above ever kicks in, this list can sum to
      // more than the actual `deductions` charged, which is the more
      // honest picture ("here's everything that was owed, but you can
      // never be charged more than one month's pay") rather than
      // quietly rescaling each reason down.
      const deductionBreakdown: { label: string; amount: number }[] = [];
      if (urgentDeduction > 0) deductionBreakdown.push({ label: `Urgent Leave (${urgentDays} day${urgentDays === 1 ? '' : 's'} × 2 days' pay)`, amount: urgentDeduction });
      if (normalDeduction > 0) deductionBreakdown.push({ label: `Normal Leave (${normalDays} day${normalDays === 1 ? '' : 's'} × 1 day's pay)`, amount: normalDeduction });
      if (absenceDeduction > 0) deductionBreakdown.push({ label: 'Absence (no-show / under 4h / inactivity)', amount: absenceDeduction });
      if (shiftShortfallDeduction > 0) deductionBreakdown.push({ label: 'Partial Shifts (worked under 8h, at/above 4h)', amount: shiftShortfallDeduction });
      if (onboardingPenalty > 0) deductionBreakdown.push({ label: 'Onboarding Not Completed', amount: onboardingPenalty });
      if (deferredThisMonth > 0) deductionBreakdown.push({ label: `Part-month pay — paid with the ${monthLabel(addMonths(targetMonthKey, 2))} salary`, amount: deferredThisMonth });
      if (reservedThisMonth > 0) deductionBreakdown.push({ label: 'First-Month Reserve (not lost — paid at resignation/termination)', amount: reservedThisMonth });

      if (existing) {
        return {
          ...existing,
          region: emp.region,
          baseSalary: existing.processed ? existing.baseSalary : effectiveBaseSalary,
          deductions: combinedDeductions,
          incrementAmount: existing.processed ? existing.incrementAmount : pendingIncrement,
          month: targetMonthKey,
          reservedThisMonth,
          deferredThisMonth,
          earlierPay,
          earlierPayLabel,
          deductionBreakdown,
          pendingArrears,
        };
      }

      return {
        id: '',
        employeeId: emp.id,
        name: emp.fullName,
        role: emp.jobTitle || 'Staff',
        region: emp.region,
        baseSalary: effectiveBaseSalary,
        unpaidLeaves: emp.onboardingCompleted ? 0 : 2,
        bonus: 0,
        deductions: combinedDeductions,
        incrementAmount: pendingIncrement,
        processed: false,
        month: targetMonthKey,
        pendingArrears,
        reservedThisMonth,
        deferredThisMonth,
        earlierPay,
        earlierPayLabel,
        deductionBreakdown,
      };
    });
}
