// Plain TypeScript — no React, no 'use client', no PocketBase client. Safe to
// import from the browser, Next route handlers and the Edge runtime alike.
// Anything time-dependent takes an injectable `now` so it is unit-testable.
import { getNYDateString } from '../timezone';
import type { AbsenceRecord, MyAbsenceRecord, Profile, TimesheetEntry, LeaveApplication, InactivityLog } from '../hr/types';
import { getWeekdaysInMonth, isWeekday, localShiftDate, addDays, eachDay } from './dates';
import { getLeaveRange, isApprovedLeaveOnDate } from './leaves';
import { secondsInsideShifts } from './inactivity';
import { elapsedMinutes } from './timesheets';
import { absenceFloorMinutes, hoursText } from './workDay';

// A single continuous mouse-inactivity run this long (37 min) during a
// shift flags the whole day as 'inactivity' — same penalty as no-show.
export const INACTIVITY_THRESHOLD_SECONDS = 37 * 60;
// A day marked absent costs this many days' pay.
export const ABSENCE_PENALTY_DAYS = 2;
/** Absence records of people who still have a profile. A removed employee's leftover records are not shown or counted: with no profile there is no salary to charge, and the page used to fall back to the amount stored on the record. */
export const recordsOfCurrentEmployees = <T extends { employeeEmail: string }>(records: T[], profiles: Pick<Profile, 'email'>[]): T[] => {
  const known = new Set(profiles.map(p => p.email.toLowerCase()));
  return records.filter(r => known.has(r.employeeEmail.toLowerCase()));
};
/** What one absent day costs at this salary, in the pay month of `date` ("YYYY-MM-DD"). The one place the charge is worked out: detection, payroll and every screen use it. */
export const absenceDayCharge = (baseSalary: number, date: string): number => {
  const charge = Math.round(ABSENCE_PENALTY_DAYS * (Number(baseSalary) || 0) / getWeekdaysInMonth(date.slice(0, 7)));
  return Number.isFinite(charge) ? Math.max(0, charge) : 0;
};
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
export function describeAbsence(reason: AbsenceCandidate['reason'], dateStr: string, inactivityMinutes?: number, workedMinutes?: number, floorMinutes: number = absenceFloorMinutes(null)): { reasonText: string; empReasonDetail: string } {
  const worked = `${Math.floor((workedMinutes || 0) / 60)}h ${(workedMinutes || 0) % 60}m`;
  const reasonText = reason === 'inactivity'
    ? `was inactive for ${inactivityMinutes} minutes during their shift on ${dateStr}`
    : reason === 'under_4_hours'
    ? `worked less than ${hoursText(floorMinutes)} hours (${worked}) on ${dateStr}`
    : `did not start a shift on ${dateStr}`;
  const empReasonDetail = reason === 'inactivity'
    ? `${inactivityMinutes} min inactivity during shift`
    : reason === 'under_4_hours'
    ? `worked only ${worked} (under ${hoursText(floorMinutes)} hours minimum)`
    : 'not starting a shift';
  return { reasonText, empReasonDetail };
}

/** One day on the employee's "Daily Deductions" list: what happened, and what was actually charged for it. */
export interface DeductionLine {
  id: string; date: string; label: string;
  /** What was actually taken for the day. */
  amount: number;
  /** An approved leave now covers the day, so nothing is taken. */
  covered: boolean;
  /** How much of the day's deduction was NOT taken because the pay had already run out (0 when all of it was). */
  shortBy: number;
}

export const hoursMinutes = (minutes: number) => `${Math.floor(minutes / 60)}h ${Math.round(minutes) % 60}m`;

/** What happened on an absence day, in plain words. */
/** `floorMinutes` is the employee's own absence floor (core/workDay.ts); the default is the full-time one. */
export function absenceReasonLabel(r: Pick<AbsenceRecord, 'reason' | 'workedMinutes' | 'inactivityMinutes'>, floorMinutes: number = absenceFloorMinutes(null)): string {
  return r.reason === 'no_clock_in'
    ? "Didn't start a shift that day"
    : r.reason === 'under_4_hours'
      ? `Only ${hoursMinutes(r.workedMinutes || 0)} worked (the minimum is ${hoursText(floorMinutes)} hours)`
      : `Mouse inactive for ${Math.round(r.inactivityMinutes || INACTIVITY_THRESHOLD_SECONDS / 60)} minutes during the shift (the limit is ${INACTIVITY_THRESHOLD_SECONDS / 60})`;
}

/**
 * The employee-facing line for each absence record, newest day first. A day that an approved leave now covers (approved
 * after the absence was recorded) reads as that leave and is charged nothing, matching what payroll really deducts.
 * `leaveOn` finds the approved leave covering a date, if any. `payAvailable` is the most that can be taken in total (the
 * month's pay): deductions never push pay below zero.
 */
export function deductionLines(records: MyAbsenceRecord[], leaveOn: (date: string) => LeaveApplication | null, payAvailable: number = Infinity, floorMinutes?: number): DeductionLine[] {
  const lines = [...records].sort((a, b) => b.date.localeCompare(a.date)).map((r): DeductionLine => {
    const leave = leaveOn(r.date);
    if (leave) return { id: r.id, date: r.date, label: `On ${leave.type} leave (approved after this was recorded)`, amount: 0, covered: true, shortBy: 0 };
    const label = absenceReasonLabel(r, floorMinutes);
    return { id: r.id, date: r.date, label, amount: r.deductionAmount, covered: false, shortBy: 0 };
  });
  // Pay can be taken down to zero but never past it: the oldest days use it up first, and a day that comes after the pay
  // has run out is charged only what is left (possibly nothing).
  let left = Math.max(0, payAvailable);
  for (const line of [...lines].reverse()) {
    if (line.covered) continue;
    const taken = Math.min(line.amount, left);
    left -= taken;
    line.shortBy = line.amount - taken;
    line.amount = taken;
  }
  return lines;
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
      const shiftMins = elapsedMinutes(t.clockIn, t.clockOut, now.getTime());

      // Absence is only triggered if a SINGLE continuous inactivity run reaches 37+ mins (2220s),
      // not by summing up multiple smaller inactive periods across the shift.
      // Only the part of a stretch that sits inside THIS shift counts: a log the tracker saved late, or that started before the shift or
      // ran past its end, must not flag the day for time the person was not on a shift.
      const thisShift = [{ clockIn: t.clockIn, clockOut: t.clockOut }];
      let maxSingleInactiveSecs = 0;
      for (const l of empInactivity) {
        const inside = secondsInsideShifts(l, thisShift, now.getTime());
        if (inside > maxSingleInactiveSecs) maxSingleInactiveSecs = inside;
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

  
      if (totalWorkedMins < absenceFloorMinutes(emp)) {
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

      const deductionAmount = absenceDayCharge(emp.baseSalary, dateStr);
      if (deductionAmount <= 0) continue; // nothing to deduct (no salary set), so there is nothing to record or announce

      candidates.push({ employee: emp, date: dateStr, reason, inactivityMinutes, workedMinutes, deductionAmount });
    }
  }
  return candidates;
}

/** The active absence records of this person that fall inside a leave's dates: once the leave is finally approved those days are charged as leave, so the absence is withdrawn. */
export function absencesCoveredByLeave(records: AbsenceRecord[], leave: LeaveApplication): AbsenceRecord[] {
  const range = getLeaveRange(leave);
  if (!range) return [];
  return records.filter(r => !r.deleted && r.employeeName === leave.employeeName && r.date >= range.start && r.date <= range.end);
}
