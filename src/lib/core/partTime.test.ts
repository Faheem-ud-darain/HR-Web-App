import { describe, expect, it } from 'vitest';
import type { Profile, TimesheetEntry } from '../hr/types';
import { absenceReasonLabel, detectAbsences, deductionLines } from './absences';
import { getShiftShortfallDeduction, getShortShiftDays } from './payroll';
import { FULL_DAY_MINUTES, PART_TIME_DAY_MINUTES, absenceFloorMinutes, canSeePartTime, hoursText, requiredDayMinutes } from './workDay';
import { classifySelfProfilePatch } from '../profileSelfFields';

// Part-time employees: a full day is 5 hours, not 8. Same salary and daily rate; only the yardstick changes.
const NOW = new Date('2026-09-11T16:00:00Z'); // a Friday; the days below are earlier that week
const SALARY = 22000; // 22 weekdays in 2026-09, so the daily rate is exactly 1,000
const emp = (over: Partial<Profile> = {}): Profile => ({
  id: 'p1', fullName: 'Test Employee', email: 'test@delcargo.us', role: 'employee', joinedDate: '2020-01-01',
  onboardingCompleted: true, baseSalary: SALARY, teams: [], region: 'Pakistan', ...over,
} as Profile);
// A worked day on a given date (NY midday), `hours` long.
const day = (date: string, hours: number): TimesheetEntry => {
  const start = new Date(`${date}T15:00:00Z`);
  const end = new Date(start.getTime() + hours * 3600 * 1000);
  return { id: date, employeeEmail: 'test@delcargo.us', date, clockIn: start.toISOString(), clockOut: end.toISOString(), status: 'completed', approvalStatus: 'pending' } as TimesheetEntry;
};
const shortfall = (p: Profile, ts: TimesheetEntry[]) => getShiftShortfallDeduction(ts, [], [], p, SALARY, '2026-09', NOW);

describe('the work day', () => {
  it('is 8 hours for everyone and 5 for part-time, with the absence floor at half of it', () => {
    expect([requiredDayMinutes(null), requiredDayMinutes(emp()), requiredDayMinutes({ partTime: true })]).toEqual([FULL_DAY_MINUTES, 480, PART_TIME_DAY_MINUTES]);
    expect([absenceFloorMinutes(emp()), absenceFloorMinutes({ partTime: true })]).toEqual([240, 150]);
    expect([hoursText(240), hoursText(150), hoursText(300)]).toEqual(['4', '2.5', '5']);
  });
});

describe('the partial-shift deduction', () => {
  it('full-time is exactly as before: 8 hours is the day, under 4 hours is left to the absence check', () => {
    expect(shortfall(emp(), [day('2026-09-02', 8)])).toBe(0);
    expect(shortfall(emp(), [day('2026-09-02', 6)])).toBe(250); // 1,000 x (1 - 6/8)
    expect(shortfall(emp(), [day('2026-09-02', 4)])).toBe(500);
    expect(shortfall(emp(), [day('2026-09-02', 3)])).toBe(0); // an absence, not a shortfall
  });
  it('part-time: a 5-hour day costs nothing, and a longer day costs nothing either', () => {
    const pt = emp({ partTime: true });
    expect(shortfall(pt, [day('2026-09-02', 5)])).toBe(0);
    expect(shortfall(pt, [day('2026-09-02', 7)])).toBe(0);
  });
  it('part-time: only the share missing from 5 hours is deducted', () => {
    const pt = emp({ partTime: true });
    expect(shortfall(pt, [day('2026-09-02', 4)])).toBe(200); // 1,000 x (1 - 4/5)
    expect(shortfall(pt, [day('2026-09-02', 3)])).toBe(400); // a day full-time would count as an absence
    expect(shortfall(pt, [day('2026-09-02', 4), day('2026-09-03', 3)])).toBe(600);
  });
  it('part-time: under 2.5 hours is left to the absence check, not charged here', () => {
    expect(shortfall(emp({ partTime: true }), [day('2026-09-02', 2)])).toBe(0);
    expect(getShortShiftDays([day('2026-09-02', 2.5)], [], [], emp({ partTime: true }), SALARY, '2026-09', NOW)).toHaveLength(1);
  });
  it('the same days cost a part-timer less than a full-timer', () => {
    const days = [day('2026-09-02', 4), day('2026-09-03', 5)];
    expect(shortfall(emp(), days)).toBeGreaterThan(shortfall(emp({ partTime: true }), days));
  });
});

describe('absence detection', () => {
  const run = (p: Profile, hours: number) => detectAbsences({ employees: [p], timesheets: [day('2026-09-09', hours)], leaves: [], inactivityLogs: [], ignoredKeys: new Set(), now: NOW }).filter(c => c.date === '2026-09-09');
  it('full-time: under 4 hours is an absence, 4 hours is not', () => {
    expect(run(emp(), 3)).toHaveLength(1);
    expect(run(emp(), 4)).toHaveLength(0);
  });
  it('part-time: 3 hours is a normal short day, under 2.5 hours is an absence', () => {
    expect(run(emp({ partTime: true }), 3)).toHaveLength(0);
    expect(run(emp({ partTime: true }), 2)).toHaveLength(1);
  });
});

describe('wording follows the employee', () => {
  it('names the employee\'s own minimum', () => {
    const rec = { id: 'a', date: '2026-09-09', reason: 'under_4_hours', workedMinutes: 100, deductionAmount: 2000, createdAt: '' } as never;
    expect(absenceReasonLabel(rec)).toContain('minimum is 4 hours');
    expect(absenceReasonLabel(rec, absenceFloorMinutes({ partTime: true }))).toContain('minimum is 2.5 hours');
    expect(deductionLines([rec], () => null, Infinity, 150)[0].label).toContain('2.5 hours');
  });
});

describe('who can see that someone is part-time', () => {
  it('HR, Admin and the employee themselves, and no one else', () => {
    expect(canSeePartTime({ email: 'hr@x.com', role: 'hr' }, 'a@x.com')).toBe(true);
    expect(canSeePartTime({ email: 'ad@x.com', role: 'admin' }, 'a@x.com')).toBe(true);
    expect(canSeePartTime({ email: 'A@x.com', role: 'employee' }, 'a@x.com')).toBe(true);
    expect(canSeePartTime({ email: 'b@x.com', role: 'employee' }, 'a@x.com')).toBe(false);
    expect(canSeePartTime({ email: 'lead@x.com', role: 'team_lead' }, 'a@x.com')).toBe(false);
    expect(canSeePartTime({ email: null, role: null }, 'a@x.com')).toBe(false);
  });
  it('an employee can not set it on their own profile', () => {
    expect(classifySelfProfilePatch({ partTime: true })).toMatchObject({ ok: false, status: 403 });
  });
});
