'use client';
// Payroll domain — extracted from hrData.ts (plan 014).
import { useQuery } from '@tanstack/react-query';
import { getNYDateString } from '../timezone';
import { getAuthToken } from '../session';
import { API_BASE } from '../apiBase';
import type { Profile, LeaveApplication, TimesheetEntry, PayrollRecord, AbsenceRecord, PayrollSelf } from './types';
import { getWeekdaysInMonth } from './shared';
import {
  getApprovedLeaveOnDate, isApprovedLeaveOnDate, getApprovedLeaveDaysInMonth,
  getRemainingPTO, getPTOAccrualDate, isWeekday,
} from './leaves';

// Standard full shift length — a day worked for this many minutes (8h)
// earns the full daily rate; less than this (but at/above the 4h absent
// floor) earns a proportional fraction. Mirrors employee/page.tsx's own
// REQUIRED_SHIFT_MINUTES constant for the "End Shift" under-8-hours notice.
const STANDARD_SHIFT_MINUTES = 8 * 60;

// Migrated off the public pb.collection('hr_payroll').getFullList() call —
// hr_payroll's PocketBase rules are locked to admins-only (plan 012 Phase
// 1). The route itself (src/app/api/admin/payroll/route.ts, GET) decides
// scope from the verified session: HR/Admin get the full company-wide
// list (unchanged behavior for admin/payroll, hr/payroll, the admin
// dashboard, and admin/insights — all already role-gated pages), anyone
// else gets only their OWN records (needed because TopNav's search bar
// calls this hook unconditionally for every role).
export function usePayroll() {
  return useQuery({
    queryKey: ['hr_payroll'],
    queryFn: async (): Promise<PayrollRecord[]> => {
      const token = getAuthToken();
      if (!token) return [];
      const res = await fetch(`${API_BASE}/api/admin/payroll`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.records || [];
    },
  });
}

// HR/Admin-only: one employee's payroll rows, via the same route's
// ?employeeId= scope. Used by exportEmployeeArchive's "Download Archive"
// action (was previously a direct public pbList call against hr_payroll).
export async function getPayrollForEmployeeAdmin(employeeId: string): Promise<any[]> {
  const token = getAuthToken();
  if (!token) return [];
  const res = await fetch(`${API_BASE}/api/admin/payroll?employeeId=${encodeURIComponent(employeeId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.records || [];
}

// HR/Admin-only: purges one employee's payroll rows. Used by
// deleteEmployee's permanent-delete purge flow (was previously a direct
// public pbList+pbDelete pair against hr_payroll). Best-effort, like the
// career-applications equivalent — a failed purge here shouldn't abort the
// rest of deleteEmployee's cleanup.
export async function deletePayrollForEmployeeAdmin(employeeId: string): Promise<void> {
  const token = getAuthToken();
  if (!token) return;
  await fetch(`${API_BASE}/api/admin/payroll?employeeId=${encodeURIComponent(employeeId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

// Employee/HR/Admin's OWN salary data, via the new server-side
// /api/payroll/me route (see that route's comment) — replaces the old
// pattern of usePayroll() + useProfiles() fetching EVERY employee's salary
// and base pay into the browser just to filter down to one person's own
// numbers. Requires a valid session JWT (src/lib/session.ts's
// getAuthToken()) from the new server-side login — see src/app/auth/page.tsx.
export function usePayrollSelf() {
  return useQuery({
    queryKey: ['payroll_self'],
    queryFn: async (): Promise<PayrollSelf | null> => {
      const token = getAuthToken();
      if (!token) return null;
      const res = await fetch(`${API_BASE}/api/payroll/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      // Route responds as { profile: {...}, pendingIncrement, payrollRecord }
      // — flattened here into one PayrollSelf object for callers.
      const data = await res.json();
      if (!data?.profile) return null;
      return { ...data.profile, pendingIncrement: data.pendingIncrement || 0, payrollRecord: data.payrollRecord || null };
    },
  });
}

// HR/Admin-gated write for a single hr_payroll record — see
// /api/admin/payroll's comment for what this does and doesn't cover yet
// (the "Process Payroll" / "Release Monthly Funds" write is authenticated;
// the payroll LIST view itself is still fed by the public useProfiles()/
// usePayroll()/useLeaves()/useTimesheets() hooks via computePayrollView,
// pending its own larger migration pass).
export async function upsertPayrollRecordAdmin(record: PayrollRecord): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error('Not signed in.');
  const res = await fetch(`${API_BASE}/api/admin/payroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ record }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
}

// Counts how many anniversary "events" (same month/day as salaryStartDate,
// one per year) have occurred on or before today, and have not yet been
// applied to base_salary. This intentionally catches up multiple missed
// years at once — e.g. a salaryStartDate set 4 years in the past with no
// prior processing history returns 4, not 0 or 1 — so setting a backdated
// salaryStartDate correctly backfills every increment that should already
// have happened, rather than only ever firing one at a time going forward.
//
// These 3 functions now just delegate to src/lib/incrementMath.ts, which
// holds the actual (identical, unchanged) implementation — pulled out into
// its own file with no client-only imports so the new server-side
// /api/payroll/me route (see that route + Notes on the auth refactor) can
// reuse the exact same math without dragging hrData.ts's React/React-Query/
// browser-`pb`-instance imports into the Edge runtime bundle. Re-exported
// here under their original names so no existing call site anywhere in the
// app needs to change.
import { getMissedIncrementEvents, getPendingIncrement, getIncrementHistory, getPendingIncrementForPayrollMonth } from '../incrementMath';
export { getMissedIncrementEvents, getPendingIncrement, getIncrementHistory, getPendingIncrementForPayrollMonth };
export type { IncrementEvent } from '../incrementMath';

export function getFinalLeavePayout(profile: Profile, leaves: LeaveApplication[]): number {
  const remainingDays = getRemainingPTO(leaves, profile.fullName, getPTOAccrualDate(profile));
  const dailyRate = profile.baseSalary / getWeekdaysInMonth(getNYDateString(new Date()).slice(0, 7));
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
    let mins = 0;
    if (t.clockOut) {
      const outTime = new Date(t.clockOut).getTime();
      if (!isNaN(outTime) && outTime > d.getTime()) mins = Math.floor((outTime - d.getTime()) / 60000);
    }
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


export const payrollActions = {
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
  computePayrollView: (employees: Profile[], existingPayroll: PayrollRecord[], leaves: LeaveApplication[], timesheets: TimesheetEntry[] = [], absenceRecords: AbsenceRecord[] = []): PayrollRecord[] => {
    const today = new Date();
    const dayOfMonth = parseInt(getNYDateString(today).split('-')[2], 10);
    
    // When payroll is accessed during the processing window (Days 1–3 of the month),
    // the target month being processed is the PREVIOUS month (e.g. Aug 1-3 processes July).
    let targetMonthDate = new Date(today);
    if (dayOfMonth >= 1 && dayOfMonth <= 3) {
      targetMonthDate.setMonth(targetMonthDate.getMonth() - 1);
    }
    const targetMonthKey = getNYDateString(targetMonthDate).slice(0, 7);

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
        let isFirstMonthLateJoiner = false;
        // True whenever targetMonthKey IS this employee's own first
        // calendar month of employment — drives the automatic first-month
        // salary reserve below (item 3), regardless of which day in that
        // month they actually joined.
        let isEmployeesFirstMonth = false;

        if (emp.joinedDate) {
          const joinedDateObj = new Date(emp.joinedDate);
          const joinedMonthKey = getNYDateString(joinedDateObj).slice(0, 7);

          // Check if employee joined in this current month
          if (joinedMonthKey === targetMonthKey) {
            isEmployeesFirstMonth = true;
            const joinDayOfMonth = parseInt(getNYDateString(joinedDateObj).split('-')[2], 10);

            // Rule:
            // - If joined in month's first 5 days (joinDayOfMonth <= 5): Processed normally with full base salary.
            // - If joined after a week (joinDayOfMonth > 5): Prorated for days worked, and carried over if unpaid.
            if (joinDayOfMonth > 5) {
              isFirstMonthLateJoiner = true;
              const year = joinedDateObj.getFullYear();
              const month = joinedDateObj.getMonth();
              const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
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
        const shiftShortfallDeduction = getShiftShortfallDeduction(timesheets, absenceRecords, leaves, emp, emp.baseSalary, targetMonthKey);

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
        const combinedDeductions = Number.isFinite(rawCombinedDeductions)
          ? Math.max(0, Math.min(rawCombinedDeductions, effectiveBaseSalary))
          : 0;

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
          deductionBreakdown,
        };
      });
  },
  // upsertPayrollRecord (public pbCreate/pbUpdate write to hr_payroll) removed —
  // dead code with zero remaining callers (superseded by upsertPayrollRecordAdmin,
  // the authenticated /api/admin/payroll POST route) before hr_payroll's
  // PocketBase rules were ever locked, per plan 012 Phase 1.

};
