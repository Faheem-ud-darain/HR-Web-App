// NOTE: leave `duration` strings are written by the app as e.g. "Sep 03, 2026 - Sep 04, 2026"
// (local-midnight dates). Those are converted to NY calendar days at read time, so
// results depend on the runner's own timezone — vitest.config.ts pins TZ=America/New_York
// to keep these deterministic. See the report on that quirk before changing it.
//
// Tests for the plain-TypeScript domain modules in src/lib/core. Nothing is
// mocked here — these modules have no React/PocketBase imports, so they run
// exactly as the server and the UI use them. `now` is always injected.
import { describe, it, expect } from 'vitest';
import { getWeekdaysInMonth, isWeekday, localShiftDate } from './dates';
import { getRemainingPTO, getAccruedPTOForDisplay, getApprovedLeaveDaysInMonth, getApprovedLeaveOnDate, parseLeaveDay, parseLeaveDateStrings, getLeaveRange, eachLeaveDay, leaveDayCount } from './leaves';
import { elapsedMinutes, getCaptureHealth, getCaptureGap, hasStaleTrackerToken, isHeartbeatLive, isShiftTabHeartbeatLive } from './timesheets';
import { detectAbsences, findWeekendAbsenceRecords, findPreJoinAbsenceRecords, describeAbsence, countAbsentWeekdays } from './absences';
import { getAbsenceDeductionForMonth, getShiftShortfallDeduction, getFinalLeavePayout } from './payroll';
import type { AbsenceRecord, InactivityLog, LeaveApplication, Profile, TimesheetEntry, TrackerHeartbeat } from '../hr/types';

function profile(over: Partial<Profile> = {}): Profile {
  return {
    id: 'p1', fullName: 'Test Employee', email: 'test@delcargo.us', role: 'employee',
    joinedDate: '2020-01-01', onboardingCompleted: true, baseSalary: 22000, teams: [], region: 'Pakistan', ...over,
  } as Profile;
}
function shift(email: string, clockIn: string, clockOut?: string): TimesheetEntry {
  return { id: `${email}${clockIn}`, employeeEmail: email, date: clockIn.slice(0, 10), clockIn, clockOut, status: clockOut ? 'completed' : 'in_progress', approvalStatus: 'pending' };
}
function leave(over: Partial<LeaveApplication> = {}): LeaveApplication {
  return { id: 'l1', employeeName: 'Test Employee', type: 'Urgent', duration: 'Sep 08, 2026 - Sep 09, 2026', reason: '', status: 'approved', ...over } as LeaveApplication;
}

// 2026-09-11 is a Friday; noon UTC is the same NY calendar day.
const NOW = new Date('2026-09-11T16:00:00Z');

describe('dates', () => {
  it('counts weekdays per month and falls back on a bad key', () => {
    expect(getWeekdaysInMonth('2026-09')).toBe(22);
    expect(getWeekdaysInMonth('2026-02')).toBe(20);
    expect(getWeekdaysInMonth('garbage')).toBe(22);
  });
  it('isWeekday reads Mon-Fri only', () => {
    expect(isWeekday('2026-09-11')).toBe(true);
    expect(isWeekday('2026-09-12')).toBe(false);
    expect(isWeekday('2026-09-13')).toBe(false);
  });
  it('localShiftDate buckets by NY calendar day and falls back', () => {
    expect(localShiftDate('2026-09-11T02:00:00Z')).toBe('2026-09-10'); // 10pm NY the day before
    expect(localShiftDate(undefined, '2026-01-01')).toBe('2026-01-01');
    expect(localShiftDate(undefined)).toBe('—');
  });
});

describe('leaves', () => {
  it('PTO reads 0 during the freeze and real after it lifts', () => {
    expect(getRemainingPTO([], 'Test Employee', '2020-01-01', new Date('2026-09-15T12:00:00Z'))).toBe(0);
    expect(getAccruedPTOForDisplay('2020-01-01', new Date('2026-09-15T12:00:00Z'))).toBe(0);
    expect(getRemainingPTO([], 'Test Employee', '2020-01-01', new Date('2027-02-01T12:00:00Z'))).toBeGreaterThan(0);
  });
  it('only counts leave days that fall inside the requested month', () => {
    const l = leave({ duration: 'Aug 31, 2026 - Sep 02, 2026' });
    expect(getApprovedLeaveDaysInMonth([l], 'Test Employee', 'Urgent', '2026-09')).toBe(2);
    expect(getApprovedLeaveDaysInMonth([l], 'Test Employee', 'Urgent', '2026-08')).toBe(1);
    expect(getApprovedLeaveDaysInMonth([leave({ duration: 'nonsense - nope' })], 'Test Employee', 'Urgent', '2026-09')).toBe(0);
  });
});

describe('leave date ranges (timezone-independent calendar days)', () => {
  it('parses the formats the app writes, plus ISO', () => {
    expect(parseLeaveDay('Sep 03, 2026')).toBe('2026-09-03');
    expect(parseLeaveDay('September 3 2026')).toBe('2026-09-03');
    expect(parseLeaveDay('2026-09-03')).toBe('2026-09-03');
    expect(parseLeaveDay('nonsense')).toBeNull();
    expect(parseLeaveDay('Foo 03, 2026')).toBeNull();
  });
  it('parses single days and ranges, and normalises a reversed range', () => {
    expect(parseLeaveDateStrings('Sep 03, 2026')).toEqual({ start: '2026-09-03', end: '2026-09-03' });
    expect(parseLeaveDateStrings('Sep 03, 2026 - Sep 05, 2026')).toEqual({ start: '2026-09-03', end: '2026-09-05' });
    expect(parseLeaveDateStrings('Sep 05, 2026 - Sep 03, 2026')).toEqual({ start: '2026-09-03', end: '2026-09-05' });
    expect(parseLeaveDateStrings('nonsense - nope')).toBeNull();
  });
  it('prefers stored start/end over the free-text duration', () => {
    expect(getLeaveRange({ duration: 'Sep 03, 2026', startDate: '2026-10-01', endDate: '2026-10-02' })).toEqual({ start: '2026-10-01', end: '2026-10-02' });
    expect(getLeaveRange({ duration: 'Sep 03, 2026' })).toEqual({ start: '2026-09-03', end: '2026-09-03' });
  });
  it('walks days across month and year boundaries, inclusive', () => {
    expect(eachLeaveDay({ start: '2026-12-30', end: '2027-01-02' })).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(leaveDayCount({ start: '2026-09-03', end: '2026-09-05' })).toBe(3);
  });
  it('covers exactly the booked days regardless of the machine timezone', () => {
    // Was off by one day when run in e.g. Asia/Karachi (local-midnight Date -> NY day).
    const l = leave({ type: 'Normal', duration: 'Sep 03, 2026 - Sep 04, 2026' });
    expect(getApprovedLeaveOnDate([l], 'Test Employee', '2026-09-02')).toBeNull();
    expect(getApprovedLeaveOnDate([l], 'Test Employee', '2026-09-03')).not.toBeNull();
    expect(getApprovedLeaveOnDate([l], 'Test Employee', '2026-09-04')).not.toBeNull();
    expect(getApprovedLeaveOnDate([l], 'Test Employee', '2026-09-05')).toBeNull();
  });
});

describe('timesheets', () => {
  it('elapsedMinutes handles closed, open and bad spans', () => {
    expect(elapsedMinutes('2026-09-10T13:00:00Z', '2026-09-10T15:30:00Z')).toBe(150);
    expect(elapsedMinutes('2026-09-10T13:00:00Z', undefined)).toBe(0);
    expect(elapsedMinutes('2026-09-10T13:00:00Z', undefined, Date.parse('2026-09-10T14:00:00Z'))).toBe(60);
    expect(elapsedMinutes('2026-09-10T15:00:00Z', '2026-09-10T13:00:00Z')).toBe(0);
    expect(elapsedMinutes('not a date', '2026-09-10T13:00:00Z')).toBe(0);
  });
  it('classifies capture health', () => {
    const hb = (over: Partial<TrackerHeartbeat>): TrackerHeartbeat => ({ employeeEmail: 'a', deviceId: 'd', connectedAt: '', lastSeenAt: '', ...over });
    expect(getCaptureHealth(null).status).toBe('unknown');
    expect(getCaptureHealth(hb({ isLocked: true })).status).toBe('locked');
    expect(getCaptureHealth(hb({ captureEnabled: false, lastCaptureError: 'Setup token not recognized' })).status).toBe('stale_token');
    expect(hasStaleTrackerToken(hb({ captureEnabled: false, lastCaptureError: 'Setup token not recognized' }))).toBe(true);
    expect(getCaptureHealth(hb({ captureEnabled: false })).status).toBe('idle');
    expect(getCaptureHealth(hb({ captureEnabled: true, consecutiveCaptureFailures: 3 })).status).toBe('failing');
    expect(getCaptureHealth(hb({ captureEnabled: true, consecutiveCaptureFailures: 0 })).status).toBe('ok');
  });
  it('heartbeat liveness uses an injectable clock', () => {
    const now = Date.parse('2026-09-11T16:00:00Z');
    const seen = (mins: number) => ({ employeeEmail: 'a', deviceId: 'd', connectedAt: '', lastSeenAt: new Date(now - mins * 60000).toISOString() });
    expect(isHeartbeatLive(seen(12), 3, now)).toBe(true);
    expect(isHeartbeatLive(seen(14), 3, now)).toBe(false);
    expect(isHeartbeatLive(null, 3, now)).toBe(false);
    expect(isShiftTabHeartbeatLive({ employeeEmail: 'a', lastSeenAt: new Date(now - 5 * 60000).toISOString() }, now)).toBe(true);
    expect(isShiftTabHeartbeatLive({ employeeEmail: 'a', lastSeenAt: new Date(now - 20 * 60000).toISOString() }, now)).toBe(false);
  });
});

describe('absences — detectAbsences (pure)', () => {
  const emp = profile();
  const run = (timesheets: TimesheetEntry[], over: { leaves?: LeaveApplication[]; logs?: InactivityLog[]; ignored?: string[]; employees?: Profile[] } = {}) =>
    detectAbsences({ employees: over.employees ?? [emp], timesheets, leaves: over.leaves ?? [], inactivityLogs: over.logs ?? [], ignoredKeys: new Set(over.ignored ?? []), now: NOW });

  it('flags a weekday with no shift as no_clock_in, 2 days of pay', () => {
    const out = run([]);
    const thu = out.find(c => c.date === '2026-09-10');
    expect(thu?.reason).toBe('no_clock_in');
    expect(thu?.deductionAmount).toBe(Math.round(2 * (22000 / 22)));
    // weekends and today are never flagged
    expect(out.some(c => c.date === '2026-09-12' || c.date === '2026-09-11')).toBe(false);
  });
  it('flags under_4_hours with the worked minutes, and treats 4h+ as present', () => {
    const short = run([shift(emp.email, '2026-09-10T13:00:00Z', '2026-09-10T15:00:00Z')]).find(c => c.date === '2026-09-10');
    expect(short).toMatchObject({ reason: 'under_4_hours', workedMinutes: 120 });
    const full = run([shift(emp.email, '2026-09-10T13:00:00Z', '2026-09-10T21:00:00Z')]).find(c => c.date === '2026-09-10');
    expect(full).toBeUndefined();
  });
  it('flags a single 37+ minute inactivity run on an otherwise full day', () => {
    const logs: InactivityLog[] = [{ id: 'i', employeeEmail: emp.email, startAt: '2026-09-10T16:00:00Z', endAt: '2026-09-10T16:40:00Z', durationSeconds: 40 * 60 }];
    const c = run([shift(emp.email, '2026-09-10T13:00:00Z', '2026-09-10T21:00:00Z')], { logs }).find(x => x.date === '2026-09-10');
    expect(c).toMatchObject({ reason: 'inactivity', inactivityMinutes: 40 });
  });
  it('respects approved leave, already-recorded keys, exemptions, and non-Pakistan staff', () => {
    expect(run([], { leaves: [leave({ type: 'Normal', duration: 'Sep 10, 2026 - Sep 10, 2026' })] }).some(c => c.date === '2026-09-10')).toBe(false);
    expect(run([], { ignored: ['test@delcargo.us_2026-09-10'] }).some(c => c.date === '2026-09-10')).toBe(false);
    expect(run([], { employees: [profile({ exemptFromAbsenceCheck: true })] })).toEqual([]);
    expect(run([], { employees: [profile({ region: 'USA' })] })).toEqual([]);
  });
  it('never flags days before the enforcement start or before joining', () => {
    expect(run([], { employees: [profile({ joinedDate: '2026-09-11' })] })).toEqual([]);
  });
  it('finds weekend and pre-join records for cleanup, and words the reasons', () => {
    const rec = (date: string): AbsenceRecord => ({ id: date, employeeEmail: 'test@delcargo.us', employeeName: 'Test Employee', date, reason: 'no_clock_in', deductionAmount: 1, createdAt: '', acknowledged: false });
    expect(findWeekendAbsenceRecords([rec('2026-09-12'), rec('2026-09-10')]).map(r => r.date)).toEqual(['2026-09-12']);
    expect(findPreJoinAbsenceRecords([rec('2026-09-01')], [profile({ joinedDate: '2026-09-05' })]).length).toBe(1);
    expect(describeAbsence('under_4_hours', '2026-09-10', undefined, 135).reasonText).toContain('2h 15m');
  });
  it('countAbsentWeekdays skips shifts, leave and weekends', () => {
    // Sept 1-10 2026: Tue 1 .. Thu 10 → 8 weekdays; 1 shift day, 1 leave day.
    const n = countAbsentWeekdays(profile(), [shift('test@delcargo.us', '2026-09-02T13:00:00Z', '2026-09-02T21:00:00Z')], [leave({ duration: 'Sep 03, 2026 - Sep 03, 2026' })], NOW);
    expect(n).toBe(7 - 1);
  });
});

describe('payroll helpers', () => {
  it('absence deduction is recomputed from current salary and skips leave days', () => {
    const rec = (date: string): AbsenceRecord => ({ id: date, employeeEmail: 'test@delcargo.us', employeeName: 'Test Employee', date, reason: 'no_clock_in', deductionAmount: 999999, createdAt: '', acknowledged: false });
    expect(getAbsenceDeductionForMonth([rec('2026-09-01'), rec('2026-09-02')], 'test@delcargo.us', 22000, '2026-09')).toBe(4000);
    expect(getAbsenceDeductionForMonth([rec('2026-09-01'), rec('2026-09-02')], 'test@delcargo.us', 22000, '2026-09', [leave({ type: 'Normal', duration: 'Sep 02, 2026 - Sep 02, 2026' })])).toBe(2000);
    expect(getAbsenceDeductionForMonth([rec('2026-09-01')], 'test@delcargo.us', NaN, '2026-09')).toBe(0);
  });
  it('shift shortfall prorates 4h-8h days only, never double-charging absent days', () => {
    const p = profile();
    const sixHours = shift(p.email, '2026-09-01T13:00:00Z', '2026-09-01T19:00:00Z'); // Tue, 360 min
    const dailyRate = 22000 / 22;
    expect(getShiftShortfallDeduction([sixHours], [], [], p, 22000, '2026-09', NOW)).toBe(Math.round(dailyRate * (1 - 360 / 480)));
    const absent: AbsenceRecord = { id: 'a', employeeEmail: p.email, employeeName: p.fullName, date: '2026-09-01', reason: 'under_4_hours', deductionAmount: 1, createdAt: '', acknowledged: false };
    expect(getShiftShortfallDeduction([sixHours], [absent], [], p, 22000, '2026-09', NOW)).toBe(0);
    expect(getShiftShortfallDeduction([sixHours], [], [], profile({ region: 'USA' }), 22000, '2026-09', NOW)).toBe(0);
    const fullDay = shift(p.email, '2026-09-01T13:00:00Z', '2026-09-01T21:00:00Z');
    expect(getShiftShortfallDeduction([fullDay], [], [], p, 22000, '2026-09', NOW)).toBe(0);
  });
  it('final leave payout is 0 during the PTO freeze', () => {
    expect(getFinalLeavePayout(profile(), [], new Date('2026-09-15T12:00:00Z'))).toBe(0);
  });
});

describe('getCaptureGap', () => {
  const base = { onShift: true, trackingOn: true, heartbeatLive: true, intervalMinutes: 15, now: Date.parse('2026-10-22T20:00:00Z') };
  it('flags an employee on shift with tracking switched OFF (the Zara case)', () => {
    expect(getCaptureGap({ ...base, trackingOn: false, lastCaptureAt: '2026-10-22T17:59:00Z', shiftStartedAt: '2026-10-22T14:15:00Z' }).status).toBe('tracking_off');
  });
  it('flags a connected tracker that stopped capturing for more than two intervals', () => {
    const r = getCaptureGap({ ...base, lastCaptureAt: '2026-10-22T18:00:00Z', shiftStartedAt: '2026-10-22T14:15:00Z' });
    expect(r).toEqual({ status: 'no_captures', minutes: 120 });
  });
  it('is quiet when capturing normally, off shift, offline, or the shift is brand new', () => {
    expect(getCaptureGap({ ...base, lastCaptureAt: '2026-10-22T19:50:00Z', shiftStartedAt: '2026-10-22T14:15:00Z' }).status).toBe('none');
    expect(getCaptureGap({ ...base, onShift: false, trackingOn: false }).status).toBe('none');
    expect(getCaptureGap({ ...base, heartbeatLive: false, lastCaptureAt: '2026-10-22T10:00:00Z', shiftStartedAt: '2026-10-22T09:00:00Z' }).status).toBe('none');
    expect(getCaptureGap({ ...base, lastCaptureAt: null, shiftStartedAt: '2026-10-22T19:50:00Z' }).status).toBe('none');
  });
  it('stays quiet for a tracker that never reports capture times (the Chromebook extension)', () => {
    expect(getCaptureGap({ ...base, captureReported: false, lastCaptureAt: null, shiftStartedAt: '2026-10-22T14:15:00Z' }).status).toBe('none');
  });
  it("does not count yesterday's last capture for today's shift", () => {
    expect(getCaptureGap({ ...base, lastCaptureAt: '2026-10-21T21:00:00Z', shiftStartedAt: '2026-10-22T19:00:00Z' }).status).toBe('no_captures');
  });
});
