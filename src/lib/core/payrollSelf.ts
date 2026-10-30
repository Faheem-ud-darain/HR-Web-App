// Plain TypeScript. The employee's OWN view of this month's pay, worked out by the same engine the HR and Admin screens
// and the monthly job use (computePayrollForMonth), so the dashboard, the Salary page and HR's payroll screen can never
// disagree. The route that serves it only loads one person's rows and calls this; it carries no pay rules of its own.
import { getNYDateString } from '../timezone';
import type { AbsenceRecord, LeaveApplication, PayrollRecord, Profile, TimesheetEntry } from '../hr/types';
import { addMonths, computePayrollForMonth } from './payroll';

/** The month an employee calls "this month": the calendar month (New York time), also on the 1st to 3rd when HR is still paying the month before. */
export const selfPayrollMonth = (now: Date): string => getNYDateString(now).slice(0, 7);

/** A late joiner's part-month pay is worked out from the joining month and paid two months later, so shifts are needed from then. */
const LOOKBACK_MONTHS = 2;
export const selfPayrollSince = (now: Date): string => addMonths(selfPayrollMonth(now), -LOOKBACK_MONTHS);

export interface SelfPayrollInputs {
  /** This person's saved payroll rows (any month). */
  payroll: PayrollRecord[];
  leaves: LeaveApplication[];
  timesheets: TimesheetEntry[];
  absences: AbsenceRecord[];
}

/**
 * This month's record for one employee: what HR's screen would show for them, or null when they have no pay this month
 * (not an employee, not yet started, already left). A saved record that is frozen or paid comes back exactly as saved; an
 * open month is worked out live. `final` is true when the figures will not change any more.
 */
export function selfPayrollRecord(profile: Profile, inputs: SelfPayrollInputs, now: Date): (PayrollRecord & { final: boolean }) | null {
  const [record] = computePayrollForMonth([profile], inputs.payroll, inputs.leaves, inputs.timesheets, inputs.absences, now, selfPayrollMonth(now));
  return record ? { ...record, final: !!(record.frozen || record.processed) } : null;
}
