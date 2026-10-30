// RULE: a month's deductions belong to that month only. When they are more than the month's pay, pay stops at zero and the
// rest is DROPPED: it is never carried into the next month. These tests run October and the month after side by side.
import { describe, it, expect } from 'vitest';
import { computePayrollForMonth } from './payroll';
import { netPay } from './payrollView';
import type { AbsenceRecord, LeaveApplication, PayrollRecord, Profile, TimesheetEntry } from '../hr/types';

const OCT = '2026-10';
const NOV = '2026-11';
const PAY_RUN_OCT = new Date('2026-11-02T16:00:00Z');
const MID_NOV = new Date('2026-11-18T16:00:00Z');

const emp = (over: Partial<Profile> = {}): Profile => ({
  id: 'p1', fullName: 'Ali Example', email: 'ali@x.us', role: 'employee', jobTitle: 'Agent',
  joinedDate: '2026-01-01', onboardingCompleted: true, baseSalary: 44000, teams: [], region: 'Pakistan', ...over,
}) as Profile;
const absence = (date: string): AbsenceRecord => ({ id: `a_${date}`, employeeEmail: 'ali@x.us', employeeName: 'Ali Example', date, reason: 'no_clock_in', deductionAmount: 0, createdAt: '', acknowledged: false }) as AbsenceRecord;
const leave = (type: LeaveApplication['type'], duration: string): LeaveApplication => ({ id: `l_${duration}`, employeeName: 'Ali Example', type, duration, reason: '', status: 'approved' }) as LeaveApplication;
const shift = (clockIn: string, minutes: number): TimesheetEntry => ({ id: clockIn, employeeEmail: 'ali@x.us', date: clockIn.slice(0, 10), clockIn, clockOut: new Date(new Date(clockIn).getTime() + minutes * 60000).toISOString(), status: 'completed', approvalStatus: 'pending' }) as TimesheetEntry;
const saved = (over: Partial<PayrollRecord>): PayrollRecord => ({ id: 'r1', employeeId: 'p1', name: 'Ali Example', role: 'Agent', region: 'Pakistan', baseSalary: 44000, unpaidLeaves: 0, bonus: 0, deductions: 0, processed: false, incrementAmount: 0, month: OCT, reservedThisMonth: 0, deductionBreakdown: [], pendingArrears: 0, ...over }) as PayrollRecord;

const octWeekdays = Array.from({ length: 28 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`).filter(d => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()));
const month = (m: string, today: Date, o: { existing?: PayrollRecord[]; leaves?: LeaveApplication[]; timesheets?: TimesheetEntry[]; absences?: AbsenceRecord[] } = {}) =>
  computePayrollForMonth([emp()], o.existing ?? [], o.leaves ?? [], o.timesheets ?? [], o.absences ?? [], today, m)[0];

describe('one month\'s deductions are not carried into the next', () => {
  it('drops the excess: October is taken down to zero and November starts with its full pay', () => {
    const absences = octWeekdays.map(absence); // 20 missed days, far more than the pay
    const oct = month(OCT, PAY_RUN_OCT, { absences });
    expect(oct.deductions).toBe(44000);
    expect(netPay(oct)).toBe(0);
    const nov = month(NOV, MID_NOV, { absences });
    expect(nov.deductions).toBe(0);
    expect(netPay(nov)).toBe(44000);
  });

  it('is the same when October\'s record is saved and still unpaid: November does not inherit it', () => {
    const existing = [saved({ deductions: 44000 })];
    const nov = month(NOV, MID_NOV, { existing, absences: octWeekdays.map(absence) });
    expect(nov).toMatchObject({ deductions: 0, bonus: 0, processed: false });
    expect(netPay(nov)).toBe(44000);
    expect(nov.pendingArrears).toBeGreaterThanOrEqual(0); // a pointer at the old unpaid row only...
    expect(netPay(nov)).toBe(nov.baseSalary + nov.incrementAmount + nov.bonus + (nov.earlierPay || 0) - nov.deductions); // ...never part of this month's pay
  });

  it('is the same when October is paid or frozen', () => {
    for (const flags of [{ processed: true }, { frozen: true }]) {
      const nov = month(NOV, MID_NOV, { existing: [saved({ deductions: 44000, ...flags })], absences: octWeekdays.map(absence) });
      expect(nov.deductions).toBe(0);
    }
  });

  it('charges a leave that spans two months only for the days inside each month', () => {
    const spanning = leave('Urgent', '2026-10-29 - 2026-11-03');
    const octOnly = month(OCT, PAY_RUN_OCT, { leaves: [leave('Urgent', '2026-10-29 - 2026-10-31')] });
    const novOnly = month(NOV, MID_NOV, { leaves: [leave('Urgent', '2026-11-01 - 2026-11-03')] });
    expect(month(OCT, PAY_RUN_OCT, { leaves: [spanning] }).deductions).toBe(octOnly.deductions);
    expect(month(NOV, MID_NOV, { leaves: [spanning] }).deductions).toBe(novOnly.deductions);
    expect(octOnly.deductions).toBeGreaterThan(0);
  });

  it('does not charge last month\'s leave this month', () => {
    const nov = month(NOV, MID_NOV, { leaves: [leave('Urgent', '2026-10-12 - 2026-10-14'), leave('Normal', '2026-10-20 - 2026-10-20')] });
    expect(nov.deductions).toBe(0);
  });

  it('does not charge last month\'s short shifts this month', () => {
    const shifts = ['2026-10-05', '2026-10-06', '2026-10-07'].map(d => shift(`${d}T14:00:00Z`, 300)); // 5 hours: under the 8-hour day
    expect(month(OCT, PAY_RUN_OCT, { timesheets: shifts }).deductions).toBeGreaterThan(0);
    expect(month(NOV, MID_NOV, { timesheets: shifts }).deductions).toBe(0);
  });

  it('never makes a month\'s pay negative, whatever is owed', () => {
    const oct = month(OCT, PAY_RUN_OCT, { absences: octWeekdays.map(absence), leaves: [leave('Urgent', '2026-10-01 - 2026-10-30')] });
    expect(oct.deductions).toBeLessThanOrEqual(oct.baseSalary);
    expect(netPay(oct)).toBeGreaterThanOrEqual(0);
  });
});
