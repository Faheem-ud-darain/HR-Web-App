// Server-only: reads everything the payroll maths needs, read-only, and maps it to the shapes the pure
// engine in lib/core uses. Shared by the monthly cron job and the assistant, so both read a row the same way.
import type { PbRow } from '../pbTypes';
import { pbFilter } from '../pbFilter';
import { getNYDateString } from '../timezone';
import { adminListAll } from '../pbAdmin';
import { mapProfileRecord } from '../core/profiles';
import { toLeave, toAbsenceRecord, toPayrollRecordFromRow } from '../core/payrollMappers';
import { toTimesheet } from '../core/timesheets';
import type { Profile, PayrollRecord, LeaveApplication, TimesheetEntry, AbsenceRecord } from '../hr/types';

export interface PayrollInputs {
  profiles: Profile[];
  extrasById: Map<string, PbRow>;
  payrollRows: PbRow[];
  breakdownRows: PbRow[];
  payroll: PayrollRecord[];
  leaves: LeaveApplication[];
  timesheets: TimesheetEntry[];
  absences: AbsenceRecord[];
}

export const breakdownKey = (employeeId: string, month: string) => `${employeeId}_${month}`;

/**
 * `sinceMonth` ("YYYY-MM") is the earliest month whose shifts are needed (timesheets are filtered from its
 * first day; open shifts are always included). Absence records are read for the last `absenceDays` days.
 */
export async function loadPayrollInputs(now: Date, sinceMonth: string, absenceDays = 120): Promise<PayrollInputs> {
  const since = `${sinceMonth}-01 00:00:00.000`;
  const absenceSince = getNYDateString(new Date(now.getTime() - absenceDays * 24 * 3600 * 1000));
  const [profileRows, extraRows, payrollRows, breakdownRows, leaveRows, timesheetRows, absenceRows] = await Promise.all([
    adminListAll('hr_profiles', 'sort=full_name'),
    adminListAll('hr_profile_extras', 'fields=id,profile_id,data'),
    adminListAll('hr_payroll', 'sort=-created'),
    adminListAll('hr_payroll_breakdowns', 'fields=id,breakdown_key,data'),
    adminListAll('hr_leaves', 'fields=id,employee_name,type,duration,reason,status,start_date,end_date'),
    adminListAll('hr_timesheets', `fields=id,employee_id,date,clock_in,clock_out,duration,status&filter=${encodeURIComponent(pbFilter('clock_out = "" || date >= {:since}', { since }))}`),
    adminListAll('hr_absence_records', `filter=${encodeURIComponent(pbFilter('deleted = false && date >= {:since}', { since: absenceSince }))}`),
  ]);
  const extrasById = new Map<string, PbRow>(extraRows.map(r => [String(r.profile_id), r]));
  const profiles = profileRows.map(p => mapProfileRecord(p, (extrasById.get(p.id)?.data || {}) as Partial<Profile>));
  const breakdownByKey = new Map<string, PbRow>(breakdownRows.map(b => [String(b.breakdown_key), b]));
  const payroll = payrollRows.map(r => toPayrollRecordFromRow(r, breakdownByKey.get(breakdownKey(r.employee_id, r.month || ''))?.data));
  return {
    profiles, extrasById, payrollRows, breakdownRows, payroll,
    leaves: leaveRows.map(toLeave),
    timesheets: timesheetRows.map(toTimesheet),
    absences: absenceRows.map(toAbsenceRecord),
  };
}

/**
 * Only ONE person's rows, for a question about that person (the assistant's "why does X have deductions").
 * Five small, filtered reads instead of loading the whole company; the pay engine gives the same answer for
 * this person because it works one employee at a time.
 */
export async function loadPayrollInputsFor(profile: Profile, now: Date, sinceMonth: string, absenceDays = 120): Promise<PayrollInputs> {
  const email = (profile.email || '').toLowerCase();
  const since = `${sinceMonth}-01 00:00:00.000`;
  const absenceSince = getNYDateString(new Date(now.getTime() - absenceDays * 24 * 3600 * 1000));
  const [payrollRows, breakdownRows, leaveRows, timesheetRows, absenceRows] = await Promise.all([
    adminListAll('hr_payroll', `sort=-created&filter=${encodeURIComponent(pbFilter('employee_id = {:id}', { id: profile.id }))}`),
    adminListAll('hr_payroll_breakdowns', `fields=id,breakdown_key,data&filter=${encodeURIComponent(pbFilter('breakdown_key ~ {:id}', { id: profile.id }))}`),
    adminListAll('hr_leaves', `fields=id,employee_name,type,duration,reason,status,start_date,end_date&filter=${encodeURIComponent(pbFilter('employee_name ~ {:n}', { n: profile.fullName }))}`),
    adminListAll('hr_timesheets', `fields=id,employee_id,date,clock_in,clock_out,duration,status&filter=${encodeURIComponent(pbFilter('employee_id ~ {:e} && (clock_out = "" || date >= {:s})', { e: email, s: since }))}`),
    adminListAll('hr_absence_records', `filter=${encodeURIComponent(pbFilter('employeeEmail ~ {:e} && deleted = false && date >= {:s}', { e: email, s: absenceSince }))}`),
  ]);
  const breakdownByKey = new Map<string, PbRow>(breakdownRows.map(b => [String(b.breakdown_key), b]));
  return {
    profiles: [profile], extrasById: new Map(), payrollRows, breakdownRows,
    payroll: payrollRows.map(r => toPayrollRecordFromRow(r, breakdownByKey.get(breakdownKey(r.employee_id, r.month || ''))?.data)),
    leaves: leaveRows.map(toLeave).filter(l => l.employeeName.trim().toLowerCase() === profile.fullName.trim().toLowerCase()),
    timesheets: timesheetRows.map(toTimesheet).filter(t => (t.employeeEmail || '').toLowerCase() === email),
    absences: absenceRows.map(toAbsenceRecord).filter(a => a.employeeEmail.toLowerCase() === email),
  };
}
