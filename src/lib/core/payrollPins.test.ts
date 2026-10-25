// PHASE 0 of plans/028-simplify-payroll-tab.md — "pins".
//
// These tests freeze what computePayrollView returns TODAY for the situations payroll actually has to
// handle (a normal month, an increment due, a first month, absences, partial shifts, a USA employee,
// unpaid earlier months, an already-paid record). They describe the current behaviour — including a
// couple of questionable ones, called out below — and exist so the payroll screens can be redesigned
// without the money changing by accident. If one of these fails after a change, either the change
// altered pay (stop and look) or it was a deliberate rule change (update the pin and say so).
//
// Month under test: October 2026 (22 weekdays). A base salary of 44,000 gives a clean daily rate
// of 2,000. `now` is 5 Nov 2026 with previousMonth=true, i.e. the "Pay run" view of October.
import { describe, it, expect } from 'vitest';
import { computePayrollView } from './payroll';
import type { AbsenceRecord, LeaveApplication, PayrollRecord, Profile, TimesheetEntry } from '../hr/types';

const NOW = new Date('2026-11-05T16:00:00Z');
const MONTH = '2026-10';

function emp(over: Partial<Profile> = {}): Profile {
  return {
    id: 'p1', fullName: 'Alex Example', email: 'alex@x.us', role: 'employee', jobTitle: 'Agent',
    joinedDate: '2026-01-01', onboardingCompleted: true, baseSalary: 44000, teams: [], region: 'Pakistan', ...over,
  } as Profile;
}
function absence(email: string, name: string, date: string, reason: AbsenceRecord['reason'] = 'no_clock_in'): AbsenceRecord {
  return { id: `a_${date}`, employeeEmail: email, employeeName: name, date, reason, deductionAmount: 0, createdAt: '', acknowledged: false } as AbsenceRecord;
}
function shift(email: string, clockIn: string, minutes: number): TimesheetEntry {
  const out = new Date(new Date(clockIn).getTime() + minutes * 60000).toISOString();
  return { id: `${email}${clockIn}`, employeeEmail: email, date: clockIn.slice(0, 10), clockIn, clockOut: out, status: 'completed', approvalStatus: 'pending' };
}
function leave(name: string, type: LeaveApplication['type'], duration: string): LeaveApplication {
  return { id: `l_${duration}`, employeeName: name, type, duration, reason: '', status: 'approved' } as LeaveApplication;
}
function record(over: Partial<PayrollRecord>): PayrollRecord {
  return {
    id: 'r1', employeeId: 'p1', name: 'Alex Example', role: 'Agent', region: 'Pakistan', baseSalary: 44000, unpaidLeaves: 0,
    bonus: 0, deductions: 0, processed: false, incrementAmount: 0, month: MONTH, reservedThisMonth: 0, deductionBreakdown: [], pendingArrears: 0, ...over,
  };
}
const run = (employees: Profile[], opts: { existing?: PayrollRecord[]; leaves?: LeaveApplication[]; timesheets?: TimesheetEntry[]; absences?: AbsenceRecord[] } = {}) =>
  computePayrollView(employees, opts.existing ?? [], opts.leaves ?? [], opts.timesheets ?? [], opts.absences ?? [], NOW, true);
const net = (r: PayrollRecord) => r.baseSalary + r.incrementAmount + r.bonus + (r.earlierPay || 0) - r.deductions;

// Pay month "Sept 5" etc.: `now` early in the month AFTER the month being looked at, previousMonth=true.
const runAt = (nowIso: string, employees: Profile[], opts: { absences?: AbsenceRecord[] } = {}) =>
  computePayrollView(employees, [], [], [], opts.absences ?? [], new Date(nowIso), true);

describe('payroll pins — new joiners (rule set by the owner, Oct 2026)', () => {
  // Joined on the 15th of August on 35,000 a month. August has 31 days, so the 17 days from the 15th are
  // round(17 x 35000 / 31) = 19,194.
  const aabru = emp({ id: 'a1', fullName: 'Aabru Z', email: 'aabru@x.us', baseSalary: 35000, joinedDate: '2026-08-15' });

  it('joined after the 5th: the part-month pay is set aside in the joining month (net pay 0) and is NOT held in reserve', () => {
    const [r] = runAt('2026-09-05T16:00:00Z', [aabru]);
    expect(r.month).toBe('2026-08');
    expect(r).toMatchObject({ baseSalary: 19194, deferredThisMonth: 19194, deductions: 19194, reservedThisMonth: 0, earlierPay: 0 });
    expect(net(r)).toBe(0);
    expect(r.deductionBreakdown).toEqual([{ label: 'Part-month pay — paid with the October 2026 salary', amount: 19194 }]);
  });

  it('the first FULL month (September) is the one held back in full', () => {
    const [r] = runAt('2026-10-05T16:00:00Z', [aabru]);
    expect(r.month).toBe('2026-09');
    expect(r).toMatchObject({ baseSalary: 35000, reservedThisMonth: 35000, deductions: 35000, deferredThisMonth: 0 });
    expect(net(r)).toBe(0);
    expect(r.deductionBreakdown.some(d => d.label.startsWith('First-Month Reserve'))).toBe(true);
  });

  it('two months after joining (October) she is paid that month in full PLUS the set-aside part-month pay', () => {
    const [r] = runAt('2026-11-05T16:00:00Z', [aabru]);
    expect(r.month).toBe('2026-10');
    expect(r).toMatchObject({ baseSalary: 35000, deductions: 0, earlierPay: 19194, reservedThisMonth: 0 });
    expect(r.earlierPayLabel).toBe('Part-month pay for August 2026 (joined 15 Aug)');
    expect(net(r)).toBe(35000 + 19194);
  });

  it('from the next month on she is paid normally', () => {
    const [r] = runAt('2026-12-05T16:00:00Z', [aabru]);
    expect(r).toMatchObject({ month: '2026-11', baseSalary: 35000, deductions: 0, earlierPay: 0, reservedThisMonth: 0 });
  });

  it('deductions that belong to the part-month reduce the amount that is paid later', () => {
    // one absence on Tue 18 Aug: 2 x 35000 / 21 weekdays in August = 3,333
    const absences = [absence('aabru@x.us', 'Aabru Z', '2026-08-18')];
    const [aug] = runAt('2026-09-05T16:00:00Z', [aabru], { absences });
    expect(aug.deferredThisMonth).toBe(19194 - 3333);
    expect(aug.deductions).toBe(19194);
    expect(net(aug)).toBe(0);
    const [oct] = runAt('2026-11-05T16:00:00Z', [aabru], { absences });
    expect(oct.earlierPay).toBe(19194 - 3333);
  });

  it('joined on the 1st–5th: that month is the one held back (in full), and the next month is paid normally', () => {
    const early = emp({ id: 'e1', email: 'early@x.us', fullName: 'Early Bird', joinedDate: '2026-08-03', baseSalary: 44000 });
    const [aug] = runAt('2026-09-05T16:00:00Z', [early]);
    expect(aug).toMatchObject({ month: '2026-08', baseSalary: 44000, reservedThisMonth: 44000, deductions: 44000, deferredThisMonth: 0 });
    expect(net(aug)).toBe(0);
    const [sep] = runAt('2026-10-05T16:00:00Z', [early]);
    expect(sep).toMatchObject({ month: '2026-09', baseSalary: 44000, deductions: 0, reservedThisMonth: 0, earlierPay: 0 });
    expect(net(sep)).toBe(44000);
  });

  it('the 5th still counts as the start of the month, the 6th does not', () => {
    const fifth = emp({ id: 'f5', email: 'f5@x.us', joinedDate: '2026-08-05', baseSalary: 44000 });
    const sixth = emp({ id: 'f6', email: 'f6@x.us', joinedDate: '2026-08-06', baseSalary: 44000 });
    expect(runAt('2026-09-05T16:00:00Z', [fifth])[0].reservedThisMonth).toBe(44000);
    expect(runAt('2026-09-05T16:00:00Z', [sixth])[0]).toMatchObject({ reservedThisMonth: 0 });
    expect(runAt('2026-09-05T16:00:00Z', [sixth])[0].deferredThisMonth).toBeGreaterThan(0);
  });
});

describe('payroll pins — October 2026', () => {
  it('a normal month: full base salary, nothing deducted', () => {
    const [r] = run([emp()]);
    expect(r).toMatchObject({ month: MONTH, baseSalary: 44000, deductions: 0, bonus: 0, incrementAmount: 0, processed: false, reservedThisMonth: 0, pendingArrears: 0, unpaidLeaves: 0 });
    expect(r.deductionBreakdown).toEqual([]);
    expect(net(r)).toBe(44000);
  });

  it('only employees and team leads are on the payroll (HR and Admin are not)', () => {
    const rows = run([emp(), emp({ id: 'h', email: 'hr@x.us', role: 'hr' }), emp({ id: 'a', email: 'a@x.us', role: 'admin' }), emp({ id: 't', email: 't@x.us', role: 'team_lead' })]);
    expect(rows.map(r => r.employeeId)).toEqual(['p1', 't']);
  });

  it('an anniversary increment counts from the month AFTER the anniversary month (Pakistan: +10,000)', () => {
    const [r] = run([emp({ joinedDate: '2025-09-15' })]);
    expect(r.incrementAmount).toBe(10000);
    expect(net(r)).toBe(54000);
    const [sameMonth] = run([emp({ joinedDate: '2025-10-15' })]); // anniversary IS October: not yet
    expect(sameMonth.incrementAmount).toBe(0);
  });

  it('a USA increment is +100 and an already-processed year is not paid twice', () => {
    const [usa] = run([emp({ region: 'USA', baseSalary: 4400, joinedDate: '2025-09-15' })]);
    expect(usa.incrementAmount).toBe(100);
    const [done] = run([emp({ joinedDate: '2025-09-15', lastIncrementProcessedYear: 2026 })]);
    expect(done.incrementAmount).toBe(0);
  });

  it('absences cost 2 days of pay each; an absence on an approved-leave day is not charged twice', () => {
    const absences = [absence('alex@x.us', 'Alex Example', '2026-10-06'), absence('alex@x.us', 'Alex Example', '2026-10-07')];
    const [two] = run([emp()], { absences });
    expect(two.deductions).toBe(8000);
    expect(two.deductionBreakdown).toEqual([{ label: 'Absence (no-show / under 4h / inactivity)', amount: 8000 }]);
    const [covered] = run([emp()], { absences, leaves: [leave('Alex Example', 'PTO', 'Oct 06, 2026 - Oct 06, 2026')] });
    expect(covered.deductions).toBe(4000); // 10-06 is covered by (unpaid-rate-free) PTO; only 10-07 counts
  });

  it('urgent leave costs 2 days of pay per day, normal leave 1 day, only for days inside the month', () => {
    const leaves = [leave('Alex Example', 'Urgent', 'Oct 12, 2026 - Oct 12, 2026'), leave('Alex Example', 'Normal', 'Oct 19, 2026 - Oct 20, 2026')];
    const [r] = run([emp()], { leaves });
    expect(r.deductions).toBe(4000 + 4000); // 1 urgent day x 2 x 2000, plus 2 normal days x 1 x 2000
    expect(r.deductionBreakdown.map(d => d.amount)).toEqual([4000, 4000]);
  });

  it('a partial shift (4h to under 8h) loses the missing share of that day; under 4h is the absence rule\'s job', () => {
    const timesheets = [
      shift('alex@x.us', '2026-10-06T14:00:00Z', 360), // 6h  -> 2000 * (1 - 360/480) = 500
      shift('alex@x.us', '2026-10-07T14:00:00Z', 300), // 5h  -> 2000 * (1 - 300/480) = 750
      shift('alex@x.us', '2026-10-08T14:00:00Z', 180), // 3h  -> not this rule
      shift('alex@x.us', '2026-10-09T14:00:00Z', 480), // 8h  -> nothing
    ];
    const [r] = run([emp()], { timesheets });
    expect(r.deductions).toBe(1250);
    expect(r.deductionBreakdown).toEqual([{ label: 'Partial Shifts (worked under 8h, at/above 4h)', amount: 1250 }]);
  });

  it('USA employees are never charged absence or partial-shift deductions, but do get leave and onboarding charges', () => {
    const usa = emp({ id: 'u1', email: 'u@x.us', fullName: 'Uma USA', region: 'USA', baseSalary: 4400, onboardingCompleted: false });
    const [r] = run([usa], {
      absences: [absence('u@x.us', 'Uma USA', '2026-10-06')],
      timesheets: [shift('u@x.us', '2026-10-07T14:00:00Z', 300)],
      leaves: [leave('Uma USA', 'Urgent', 'Oct 12, 2026 - Oct 12, 2026')],
    });
    // The USA absence rule is skipped only by the shortfall function; the absence-record sum itself is
    // region-blind (no absence records are ever created for USA staff by the detector). Pinned as is.
    expect(r.unpaidLeaves).toBe(2);
    expect(r.deductionBreakdown.map(d => d.label.split(' (')[0])).toEqual(['Urgent Leave', 'Absence', 'Onboarding Not Completed']);
    expect(r.deductions).toBe(400 + 400 + 10);
  });

  it('onboarding not completed: 200 for Pakistan', () => {
    const [r] = run([emp({ onboardingCompleted: false })]);
    expect(r.deductions).toBe(200);
    expect(r.unpaidLeaves).toBe(2);
  });

  it('deductions can never exceed the month\'s base salary or go negative', () => {
    const absences = ['02', '05', '06', '07', '08', '09', '12'].map(d => absence('alex@x.us', 'Alex Example', `2026-10-${d}`)); // 7 x 4000 = 28000... plus leave below
    const leaves = [leave('Alex Example', 'Urgent', 'Oct 13, 2026 - Oct 16, 2026')]; // 4 x 4000 = 16000
    const [r] = run([emp()], { absences, leaves });
    expect(r.deductions).toBe(44000); // 28000 + 16000 = 44000 exactly at the cap here
    const [over] = run([emp()], { absences, leaves: [leave('Alex Example', 'Urgent', 'Oct 13, 2026 - Oct 21, 2026')] });
    expect(over.deductions).toBe(44000); // capped, even though the raw total is higher
    expect(over.deductionBreakdown.reduce((s, d) => s + d.amount, 0)).toBeGreaterThan(44000); // the itemised list still shows the full raw amounts
  });

  it('an earlier unpaid month is shown as arrears but never added into this month\'s pay', () => {
    const sept = record({ id: 'sep', month: '2026-09', baseSalary: 44000, deductions: 4000, bonus: 1000, incrementAmount: 0, processed: false });
    const aug = record({ id: 'aug', month: '2026-08', baseSalary: 44000, deductions: 0, processed: true });
    const [r] = run([emp()], { existing: [sept, aug] });
    expect(r.pendingArrears).toBe(44000 - 4000 + 1000);
    expect(r.baseSalary).toBe(44000);
    expect(r.deductions).toBe(0);
  });

  it('a stored record keeps its bonus; an unpaid one takes the live base salary and increment', () => {
    const stored = record({ bonus: 1500, baseSalary: 1, incrementAmount: 7 });
    const [r] = run([emp({ joinedDate: '2025-09-15' })], { existing: [stored] });
    expect(r.id).toBe('r1');
    expect(r.bonus).toBe(1500);
    expect(r.baseSalary).toBe(44000);
    expect(r.incrementAmount).toBe(10000);
  });

  it('PINNED QUIRK — an already-paid record keeps its stored base salary and increment, but its deductions are still recalculated live', () => {
    // This is how the code behaves today and it matters for the month-freeze work in plan 028: if an
    // absence record is added (or removed) after a month was marked paid, the "paid" row's deductions
    // — and therefore its net pay — change after the fact. Plan 028 fixes this by freezing a month.
    const paid = record({ processed: true, baseSalary: 40000, incrementAmount: 0, bonus: 500, deductions: 0 });
    const [before] = run([emp()], { existing: [paid] });
    expect(before).toMatchObject({ processed: true, baseSalary: 40000, bonus: 500, deductions: 0 });
    const [after] = run([emp()], { existing: [paid], absences: [absence('alex@x.us', 'Alex Example', '2026-10-06')] });
    expect(after).toMatchObject({ processed: true, baseSalary: 40000, bonus: 500 });
    expect(after.deductions).toBe(4000); // changed AFTER payment
  });
});
