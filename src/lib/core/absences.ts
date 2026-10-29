// Plain TypeScript — no React, no 'use client', no PocketBase client. Safe to
// import from the browser, Next route handlers and the Edge runtime alike.
// Anything time-dependent takes an injectable `now` so it is unit-testable.
import { getNYDateString } from '../timezone';
import type { AbsenceRecord, MyAbsenceRecord, Profile, TimesheetEntry, LeaveApplication, InactivityLog } from '../hr/types';
import { getWeekdaysInMonth, isWeekday, localShiftDate, addDays, eachDay } from './dates';
import { isApprovedLeaveOnDate } from './leaves';
import { elapsedMinutes } from './timesheets';

// A single continuous mouse-inactivity run this long (37 min) during a
// shift flags the whole day as 'inactivity' — same penalty as no-show.
export const INACTIVITY_THRESHOLD_SECONDS = 37 * 60;
// Under 4 hours on shift in a day = absent, 4h or more = present.
export const MIN_REQUIRED_WORK_MINUTES = 4 * 60;
// Absence enforcement began on this date; earlier days are never flagged.
export const ABSENCE_ENFORCEMENT_START_DATE = '2026-08-04';
// runAbsenceCheck only ever looks back this many days.
export const ABSENCE_LOOKBACK_DAYS = 5;

// Per explicit product decision: only Pakistan-region employees are subject
// to this check (USA staff clock in/out automatically via GPS geofencing,
// so a "missing" shift there means something different — a device/GPS
// issue, not a no-show — and isn't penalized the same way). Counts weekdays
// (Mon-Fri, America/New_York calendar) in the current pay month, from the
// 1st through yesterday (today doesn't count — its 24 hours haven't fully
// elapsed yet), where the employee has neither a timesheet shift nor
// approved leave covering that day. Days before the employee's own
// joinedDate are never counted (can't be absent from a job you hadn't
// started yet).
export function countAbsentWeekdays(
  profile: Pick<Profile, 'fullName' | 'region' | 'joinedDate'>,
  timesheets: TimesheetEntry[],
  leaves: LeaveApplication[],
  today: Date = new Date()
): number {
  if (profile.region !== 'Pakistan') return 0;

  const todayStr = getNYDateString(today);
  // joinedDate is a plain calendar date ("YYYY-MM-DD") — take it directly
  // rather than round-tripping through new Date()+NY conversion, which reads
  // a date-only string as UTC midnight and rolls it back a day once
  // converted to NY time (see the matching fix/comment in runAbsenceCheck).
  const joinedStr = profile.joinedDate && /^\d{4}-\d{2}-\d{2}/.test(profile.joinedDate)
    ? profile.joinedDate.slice(0, 10)
    : '';

  // Every calendar date this employee actually has a shift recorded for,
  // regardless of which device/timezone wrote it — localShiftDate always
  // re-derives the date in America/New_York from the real clockIn instant.
  const shiftDates = new Set(
    timesheets
      .filter(t => t.employeeEmail && t.clockIn)
      .map(t => localShiftDate(t.clockIn, t.date))
  );

  let absentDays = 0;
  // First of the New York month through yesterday — string math, no local-timezone dates.
  for (const dateStr of eachDay(`${todayStr.slice(0, 8)}01`, addDays(todayStr, -1))) {
    if (dateStr >= todayStr) break; // never count today or the future
    if (joinedStr && dateStr < joinedStr) continue; // not employed yet
    if (!isWeekday(dateStr)) continue;
    if (shiftDates.has(dateStr)) continue;
    if (isApprovedLeaveOnDate(leaves, profile.fullName, dateStr)) continue;
    absentDays++;
  }
  return absentDays;
}

export interface AbsenceCandidate {
  employee: Profile;
  date: string;
  reason: NonNullable<AbsenceRecord['reason']>;
  inactivityMinutes?: number;
  workedMinutes?: number;
  deductionAmount: number;
}

// Records on a Saturday/Sunday (NY calendar) are always wrong — employees
// are never marked absent on weekends.
export function findWeekendAbsenceRecords(records: AbsenceRecord[]): AbsenceRecord[] {
  return records.filter(r => !isWeekday(r.date));
}

// Records dated before the employee's own joinedDate are always wrong
// (can't be absent from a job you hadn't started yet).
export function findPreJoinAbsenceRecords(records: AbsenceRecord[], employees: Profile[]): AbsenceRecord[] {
  return records.filter(rec => {
    const emp = employees.find(e => e.email.toLowerCase() === rec.employeeEmail.toLowerCase());
    if (!emp?.joinedDate || !/^\d{4}-\d{2}-\d{2}/.test(emp.joinedDate)) return false;
    return rec.date < emp.joinedDate.slice(0, 10);
  });
}

// Wording shared by the HR/Admin and employee absence notifications.
export function describeAbsence(reason: AbsenceCandidate['reason'], dateStr: string, inactivityMinutes?: number, workedMinutes?: number): { reasonText: string; empReasonDetail: string } {
  const worked = `${Math.floor((workedMinutes || 0) / 60)}h ${(workedMinutes || 0) % 60}m`;
  const reasonText = reason === 'inactivity'
    ? `was inactive for ${inactivityMinutes} minutes during their shift on ${dateStr}`
    : reason === 'under_4_hours'
    ? `worked less than 4 hours (${worked}) on ${dateStr}`
    : `did not start a shift on ${dateStr}`;
  const empReasonDetail = reason === 'inactivity'
    ? `${inactivityMinutes} min inactivity during shift`
    : reason === 'under_4_hours'
    ? `worked only ${worked} (under 4 hours minimum)`
    : 'not starting a shift';
  return { reasonText, empReasonDetail };
}

/** One day on the employee's "Daily Deductions" list: what happened, and what was actually charged for it. */
export interface DeductionLine { id: string; date: string; label: string; amount: number; covered: boolean }

const hoursMinutes = (minutes: number) => `${Math.floor(minutes / 60)}h ${Math.round(minutes) % 60}m`;

/**
 * The employee-facing line for each absence record, newest day first. A day that an approved leave now covers (approved
 * after the absence was recorded) reads as that leave and is charged nothing, matching what payroll really deducts.
 * `leaveOn` finds the approved leave covering a date, if any.
 */
export function deductionLines(records: MyAbsenceRecord[], leaveOn: (date: string) => LeaveApplication | null): DeductionLine[] {
  return [...records].sort((a, b) => b.date.localeCompare(a.date)).map(r => {
    const leave = leaveOn(r.date);
    if (leave) return { id: r.id, date: r.date, label: `On ${leave.type} leave (approved after this was recorded)`, amount: 0, covered: true };
    const label = r.reason === 'no_clock_in'
      ? "Didn't start a shift that day"
      : r.reason === 'under_4_hours'
        ? `Only ${hoursMinutes(r.workedMinutes || 0)} worked (the minimum is ${MIN_REQUIRED_WORK_MINUTES / 60} hours)`
        : `Mouse inactive for ${Math.round(r.inactivityMinutes || INACTIVITY_THRESHOLD_SECONDS / 60)} minutes during the shift (the limit is ${INACTIVITY_THRESHOLD_SECONDS / 60})`;
    return { id: r.id, date: r.date, label, amount: r.deductionAmount, covered: false };
  });
}

/** The pay months ("YYYY-MM") that have a deduction, plus the current one, newest first. */
export function deductionMonths(records: Pick<MyAbsenceRecord, 'date'>[], currentMonth: string): string[] {
  return [...new Set([currentMonth, ...records.map(r => r.date.slice(0, 7))])].sort().reverse();
}

// Day bucketing
  // Per explicit product decision: absence "day" bucketing runs on the same
  // America/New_York midnight-boundary calendar used everywhere else in the
  // app (shift dates via localShiftDate, leave dates, attendance display) —
  // not the employee's own device/region timezone. Using a different
  // timezone basis here than the rest of the app was the root cause of
  // employees getting marked absent on what was actually a Saturday/Sunday
  // from this app's own point of view: a several-hour day-boundary offset
  // could shift a date across the Mon-Fri/weekend line entirely.
//
// The classification decision behind runAbsenceCheck — no I/O. Returns every
// (employee, weekday) in the lookback window that should NEWLY be marked
// absent: no clock-in, under 4 hours worked, or a 37+ minute continuous
// inactivity run — skipping approved-leave days, pre-join days, weekends,
// non-Pakistan / exempt staff, and any `${email}_${date}` key already in
// `ignoredKeys` (the full history including soft-deleted rows).
export function detectAbsences(input: {
  employees: Profile[];
  timesheets: TimesheetEntry[];
  leaves: LeaveApplication[];
  inactivityLogs: InactivityLog[];
  ignoredKeys: Set<string>;
  now?: Date;
}): AbsenceCandidate[] {
  const { employees, timesheets, leaves, inactivityLogs, ignoredKeys, now = new Date() } = input;
  const nyTodayStr = getNYDateString(now);
  const candidates: AbsenceCandidate[] = [];
  for (const emp of employees) {
    if (emp.region !== 'Pakistan') continue;
    if (emp.role !== 'employee' && emp.role !== 'team_lead') continue;
    // Skip part-time employees or anyone explicitly marked exempt by HR/Admin
    if (emp.exemptFromAbsenceCheck) continue;

    const empTimesheets = timesheets.filter(t => t.employeeEmail && t.employeeEmail.toLowerCase() === emp.email.toLowerCase() && t.clockIn);
    const empInactivity = inactivityLogs.filter(l => l.employeeEmail && l.employeeEmail.toLowerCase() === emp.email.toLowerCase());
    
    // joinedDate is stored as a plain calendar date ("YYYY-MM-DD") — the
    // actual day the employee joined, not a specific instant. Take the
    // date portion directly instead of round-tripping through
    // `new Date(...)` + NY-timezone conversion: a date-only string parses
    // as UTC midnight, and converting THAT to NY time rolls it back to
    // the previous evening — e.g. "2026-08-16" became "2026-08-15" —
    // silently shifting the join-date cutoff.
    const joinedStr = emp.joinedDate && /^\d{4}-\d{2}-\d{2}/.test(emp.joinedDate)
      ? emp.joinedDate.slice(0, 10)
      : '';

    const shiftDatesWithShift = new Set<string>();
    const shiftDatesWithTotalMinutes = new Map<string, number>();
    const shiftDatesWithMaxSingleInactivity = new Map<string, number>();

    for (const t of empTimesheets) {
      if (!t.clockIn) continue;

      // Bucket by the absolute UTC clockIn timestamp converted to the NY
      // midnight-boundary calendar day — consistent with how every other
      // date in the app (leaves, timesheets shown on the Attendance page,
      // etc.) is bucketed via getNYDateString/localShiftDate.
      const d = new Date(t.clockIn);
      if (isNaN(d.getTime())) continue;
      const shiftDate = getNYDateString(d);
      shiftDatesWithShift.add(shiftDate);

      const inTime = d.getTime();
      // BUGFIX 2026-09-11: an OPEN shift (no clock_out yet) used to skip
      // the inactivity check entirely — logsForShift/maxSingleInactiveSecs
      // were only ever computed inside the `if (t.clockOut)` branch below,
      // while this branch's elapsed-time minutes still counted toward
      // "worked" time. That let an employee clock in and leave the shift
      // running (real screen inactivity the whole time, or the whole day
      // spent doing nothing) show up as a normal, fully-present day with
      // zero inactivity flag, for as long as the shift stayed open — up to
      // the 16h autoCloseStaleOpenShifts cap, and only caught retroactively
      // once that auto-close set clock_out and a LATER absence-check run
      // happened to re-evaluate the date. Using Date.now() as a synthetic
      // outTime for still-open shifts means inactivity is now checked on
      // every run, not just after the shift eventually closes — this
      // can't change today's own status (the caller's date loop always
      // skips `dateStr >= nyTodayStr`), it only fixes a PAST day whose
      // shift is still sitting open.
      const outTime = t.clockOut ? new Date(t.clockOut).getTime() : now.getTime();
      const shiftMins = elapsedMinutes(t.clockIn, t.clockOut, now.getTime());

      // Absence is only triggered if a SINGLE continuous inactivity run reaches 37+ mins (2220s),
      // not by summing up multiple smaller inactive periods across the shift.
      const logsForShift = empInactivity.filter(l => {
        const lt = new Date(l.startAt).getTime();
        return lt >= inTime && lt <= outTime;
      });
      let maxSingleInactiveSecs = 0;
      for (const l of logsForShift) {
        const duration = l.durationSeconds || 0;
        if (duration > maxSingleInactiveSecs) {
          maxSingleInactiveSecs = duration;
        }
      }
      const existingMax = shiftDatesWithMaxSingleInactivity.get(shiftDate) || 0;
      shiftDatesWithMaxSingleInactivity.set(shiftDate, Math.max(existingMax, maxSingleInactiveSecs));

      const existingTotal = shiftDatesWithTotalMinutes.get(shiftDate) || 0;
      shiftDatesWithTotalMinutes.set(shiftDate, existingTotal + shiftMins);
    }

    for (const dateStr of eachDay(addDays(nyTodayStr, -ABSENCE_LOOKBACK_DAYS), addDays(nyTodayStr, -1))) {
      if (dateStr >= nyTodayStr) break;
      if (dateStr < ABSENCE_ENFORCEMENT_START_DATE) continue;
      if (joinedStr && dateStr < joinedStr) continue;
      if (!isWeekday(dateStr)) continue; // Saturday/Sunday (by NY calendar) are never checked
      const ignoreKey = `${emp.email.toLowerCase()}_${dateStr}`;
      if (ignoredKeys.has(ignoreKey)) continue;

      const totalWorkedMins = shiftDatesWithTotalMinutes.get(dateStr) || 0;
      const onLeave = isApprovedLeaveOnDate(leaves, emp.fullName, dateStr);

      let reason: AbsenceRecord['reason'] | null = null;
      let inactivityMinutes: number | undefined;
      let workedMinutes: number | undefined;

  
      if (totalWorkedMins < MIN_REQUIRED_WORK_MINUTES) {
        if (!onLeave) {
          if (totalWorkedMins === 0) {
            reason = 'no_clock_in';
          } else {
            reason = 'under_4_hours';
            workedMinutes = totalWorkedMins;
          }
        }
      } else if (!onLeave) {
        const maxSingleInactiveSecs = shiftDatesWithMaxSingleInactivity.get(dateStr) || 0;
        if (maxSingleInactiveSecs >= INACTIVITY_THRESHOLD_SECONDS) {
          reason = 'inactivity';
          inactivityMinutes = Math.round(maxSingleInactiveSecs / 60);
        }
      }
      if (!reason) continue; // present and accounted for (worked >= 4h without excessive inactivity)

      const dailyRate = emp.baseSalary / getWeekdaysInMonth(dateStr.slice(0, 7));
      const deductionAmount = Math.round(2 * dailyRate);

      candidates.push({ employee: emp, date: dateStr, reason, inactivityMinutes, workedMinutes, deductionAmount });
    }
  }
  return candidates;
}
