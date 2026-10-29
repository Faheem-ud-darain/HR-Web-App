import { describe, it, expect } from 'vitest';
import { selfPayrollMonth, selfPayrollRecord, selfPayrollSince } from './payrollSelf';
import { netPay } from './payrollView';
import type { AbsenceRecord, LeaveApplication, PayrollRecord, Profile } from '../hr/types';

const emp = (over: Partial<Profile> = {}): Profile => ({
  id: 'p1', fullName: 'Ali Example', email: 'ali@x.us', role: 'employee', jobTitle: 'Agent',
  joinedDate: '2026-01-01', onboardingCompleted: true, baseSalary: 44000, teams: [], region: 'Pakistan', ...over,
}) as Profile;
const absence = (date: string): AbsenceRecord => ({ id: `a_${date}`, employeeEmail: 'ali@x.us', employeeName: 'Ali Example', date, reason: 'no_clock_in', deductionAmount: 0, createdAt: '', acknowledged: false }) as AbsenceRecord;
const leave = (type: LeaveApplication['type'], duration: string): LeaveApplication => ({ id: 'l1', employeeName: 'Ali Example', type, duration, reason: '', status: 'approved' }) as LeaveApplication;
const saved = (over: Partial<PayrollRecord>): PayrollRecord => ({
  id: 'r1', employeeId: 'p1', name: 'Ali Example', role: 'Agent', region: 'Pakistan', baseSalary: 44000, unpaidLeaves: 0, bonus: 0, deductions: 0,
  processed: false, incrementAmount: 0, month: '2026-10', reservedThisMonth: 0, deductionBreakdown: [], pendingArrears: 0, ...over,
}) as PayrollRecord;
const none = { payroll: [], leaves: [], timesheets: [], absences: [] };

describe('which month an employee calls "this month"', () => {
  it('is the calendar month, even on the 1st to 3rd when HR is still paying the month before', () => {
    expect(selfPayrollMonth(new Date('2026-11-02T16:00:00Z'))).toBe('2026-11');
    expect(selfPayrollMonth(new Date('2026-10-29T16:00:00Z'))).toBe('2026-10');
  });
  it('reads shifts from two months back so a late joiner\'s part-month pay can be found', () => {
    expect(selfPayrollSince(new Date('2026-11-02T16:00:00Z'))).toBe('2026-09');
    expect(selfPayrollSince(new Date('2026-01-10T16:00:00Z'))).toBe('2025-11');
  });
});

describe('selfPayrollRecord', () => {
  const NOW = new Date('2026-10-29T16:00:00Z');

  it('is the month in progress, live, and not final: absence and leave deductions both count', () => {
    const r = selfPayrollRecord(emp(), { ...none, absences: [absence('2026-10-05')], leaves: [leave('Urgent', '2026-10-12 - 2026-10-12')] }, NOW)!;
    expect(r.month).toBe('2026-10');
    expect(r.final).toBe(false);
    expect(r.deductions).toBeGreaterThan(2000 * 2);        // a day of urgent leave is 2 days' pay (4,000) and the absence adds more
    expect(netPay(r)).toBe(r.baseSalary - r.deductions);
  });

  it('never takes more than the month\'s pay, however many absences there are', () => {
    const days = Array.from({ length: 20 }, (_, i) => absence(`2026-10-${String(i + 1).padStart(2, '0')}`));
    const r = selfPayrollRecord(emp(), { ...none, absences: days }, NOW)!;
    expect(r.deductions).toBeLessThanOrEqual(r.baseSalary);
    expect(netPay(r)).toBeGreaterThanOrEqual(0);
  });

  it('gives a saved, paid month back exactly as saved, and final, whatever has happened since', () => {
    const r = selfPayrollRecord(emp(), { ...none, payroll: [saved({ processed: true, deductions: 1500, bonus: 500 })], absences: [absence('2026-10-05')] }, NOW)!;
    expect(r).toMatchObject({ deductions: 1500, bonus: 500, processed: true, final: true });
  });

  it('keeps a frozen month as frozen even before it is paid', () => {
    const r = selfPayrollRecord(emp(), { ...none, payroll: [saved({ frozen: true, deductions: 700 })], absences: [absence('2026-10-05')] }, NOW)!;
    expect(r).toMatchObject({ deductions: 700, processed: false, final: true });
  });

  it('keeps the bonus HR saved while the month is still open', () => {
    const r = selfPayrollRecord(emp(), { ...none, payroll: [saved({ bonus: 3000 })] }, NOW)!;
    expect(r).toMatchObject({ bonus: 3000, final: false });
  });

  it('starts a fresh month, not last month\'s paid record, when the saved record is for the month before', () => {
    const r = selfPayrollRecord(emp(), { ...none, payroll: [saved({ month: '2026-09', processed: true, bonus: 9000, deductions: 8000 })] }, NOW)!;
    expect(r).toMatchObject({ month: '2026-10', bonus: 0, processed: false, final: false });
  });

  it('on the 2nd of a month shows the new month, not the one HR is still paying', () => {
    const r = selfPayrollRecord(emp(), { ...none, payroll: [saved({ month: '2026-10', processed: false })] }, new Date('2026-11-02T16:00:00Z'))!;
    expect(r.month).toBe('2026-11');
  });

  it('holds a new joiner\'s first month back in full, so the net pay is zero', () => {
    const r = selfPayrollRecord(emp({ joinedDate: '2026-10-02' }), none, NOW)!;
    expect(r.reservedThisMonth).toBe(44000);
    expect(netPay(r)).toBe(0);
  });

  it('is null for someone with no pay this month (HR and Admin are not on payroll)', () => {
    expect(selfPayrollRecord(emp({ role: 'hr' }), none, NOW)).toBeNull();
  });
});
