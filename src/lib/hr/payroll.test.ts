// Tests for payrollActions.computePayrollView and the anniversary-increment
// deferral rule it depends on (getPendingIncrementForPayrollMonth). Pure
// function, no PocketBase/network involved — see plans/015-add-test-coverage.md
// step 2.
//
// "Today" is pinned via vi.setSystemTime so targetMonthKey (computePayrollView's
// own "which calendar month am I processing" logic) is deterministic across
// runs — see computePayrollView's own comment: Days 1-3 of a month process
// the PREVIOUS month, any other day processes the current month. Pinned to
// the 10th so every test below processes "2026-09" (not a rollover day).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { payrollActions, getPendingIncrementForPayrollMonth } from './payroll';
import type { Profile, AbsenceRecord } from './types';

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'emp1',
    fullName: 'Test Employee',
    email: 'test@delcargo.us',
    role: 'employee',
    joinedDate: '2020-01-01', // long-tenured by default — not this month's joiner
    onboardingCompleted: true,
    baseSalary: 30000,
    teams: [],
    region: 'Pakistan',
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-10T12:00:00Z')); // NY: Sep 10, 8am EDT — mid-month, not a rollover day
});

afterEach(() => {
  vi.useRealTimers();
});

describe('computePayrollView — normal full-month employee', () => {
  it('a long-tenured employee with no leaves/absences gets their full base salary and zero deductions', () => {
    const emp = makeProfile({ baseSalary: 60000 });
    const [record] = payrollActions.computePayrollView([emp], [], [], [], []);
    expect(record.baseSalary).toBe(60000);
    expect(record.deductions).toBe(0);
    expect(record.reservedThisMonth).toBe(0); // not their first month — nothing withheld
    expect(record.month).toBe('2026-09');
  });
});

describe('computePayrollView — mid-month joiner proration (own documented threshold)', () => {
  // The joining date is a calendar date ("2026-09-06"), read exactly as written. (It used to be parsed as
  // midnight UTC and shown in New York time, i.e. the previous evening, so every joinedDate in these tests
  // had to be written one day ahead — that was fixed on 2026-10-25 together with the new-joiner pay rule.)
  it('joining within the first 5 days of the month (day <= 5) is processed at full base salary, not prorated', () => {
    // The 5th itself is the boundary and still counts as "joined at the start of the month".
    const emp = makeProfile({ joinedDate: '2026-09-05', baseSalary: 30000 });
    const [record] = payrollActions.computePayrollView([emp], [], [], [], []);
    expect(record.baseSalary).toBe(30000);
    // Still their first calendar month of employment, so the whole (unprorated) amount is held back.
    expect(record.reservedThisMonth).toBe(30000);
  });

  it('joining after the first 5 days of the month (day > 5) is prorated for days actually worked, and set aside to be paid later (not held)', () => {
    // The 6th is one day past the boundary. September 2026 has 30 days; days worked = 30 - 6 + 1 = 25.
    const emp = makeProfile({ joinedDate: '2026-09-06', baseSalary: 30000 });
    const [record] = payrollActions.computePayrollView([emp], [], [], [], []);
    const expectedProrated = Math.round(25 * (30000 / 30));
    expect(record.baseSalary).toBe(expectedProrated);
    expect(record.baseSalary).toBeLessThan(30000);
    // New-joiner rule: the part-month pay is withheld this month and paid with the salary two months
    // later; it is NOT held in the reserve (the first FULL month is the one held back).
    expect(record.reservedThisMonth).toBe(0);
    expect(record.deferredThisMonth).toBe(expectedProrated);
    expect(record.deductions).toBe(expectedProrated);
  });

  it('joining well into the month (e.g. the 20th) prorates down further than joining on the 6th', () => {
    const emp = makeProfile({ joinedDate: '2026-09-20', baseSalary: 30000 });
    const [record] = payrollActions.computePayrollView([emp], [], [], [], []);
    // days worked = 30 - 20 + 1 = 11
    expect(record.baseSalary).toBe(Math.round(11 * (30000 / 30)));
  });
});

describe('computePayrollView — anniversary-increment deferral', () => {
  // getMissedIncrementEventsForPayrollMonth/getPendingIncrementForPayrollMonth
  // (re-exported from payroll.ts) must not count an anniversary event until
  // the calendar month AFTER the anniversary's own month, regardless of how
  // payroll processing timing lines up with the real anniversary date.
  it('an anniversary falling in the SAME month being processed does not yet count as pending', () => {
    const profile = { baseSalary: 30000, salaryStartDate: '2024-08-15', region: 'Pakistan' as const, lastIncrementProcessedYear: 2025 };
    // Processing August 2026's payroll — the anniversary's own month —
    // the raise must not show up yet.
    expect(getPendingIncrementForPayrollMonth(profile, '2026-08')).toBe(0);
  });

  it('the calendar month AFTER the anniversary month does show the increment as pending', () => {
    const profile = { baseSalary: 30000, salaryStartDate: '2024-08-15', region: 'Pakistan' as const, lastIncrementProcessedYear: 2025 };
    // 2026 is the 2nd anniversary year; 2025's anniversary was already
    // processed (lastIncrementProcessedYear: 2025), so exactly one event
    // (2026's) is pending, at Pakistan's flat per-event amount (10000).
    expect(getPendingIncrementForPayrollMonth(profile, '2026-09')).toBe(10000);
  });

  it('computePayrollView itself reflects the deferred increment in incrementAmount for the current (pinned) target month', () => {
    // Pinned "today" is 2026-09-10, so targetMonthKey is '2026-09' — one
    // full calendar month after this employee's August anniversary, so the
    // increment must already be showing as pending in the record itself.
    const emp = makeProfile({ salaryStartDate: '2024-08-15', lastIncrementProcessedYear: 2025, region: 'Pakistan' });
    const [record] = payrollActions.computePayrollView([emp], [], [], [], []);
    expect(record.incrementAmount).toBe(10000);
  });
});

describe('computePayrollView — USA vs Pakistan currency handling', () => {
  // Per the inline comment in admin/insights/page.tsx: USA salaries are USD
  // and Pakistan salaries are PKR, two genuinely different currencies with
  // no conversion anywhere in this app — they must never be summed into one
  // blended number. computePayrollView itself operates per-employee (it has
  // no cross-employee total at all), so the real guarantee to test here is
  // that each returned record stays scoped to its own employee's own region
  // and native salary figure — nothing here ever combines a USA employee's
  // dollar figure with a Pakistan employee's rupee figure into one number.
  it('each record keeps its own employee region and native-currency baseSalary, never blended with another employee\'s', () => {
    const usaEmp = makeProfile({ id: 'usa1', fullName: 'USA Employee', region: 'USA', baseSalary: 5000 });
    const pkEmp = makeProfile({ id: 'pk1', fullName: 'Pakistan Employee', region: 'Pakistan', baseSalary: 150000 });
    const records = payrollActions.computePayrollView([usaEmp, pkEmp], [], [], [], []);

    const usaRecord = records.find(r => r.employeeId === 'usa1')!;
    const pkRecord = records.find(r => r.employeeId === 'pk1')!;

    expect(usaRecord.region).toBe('USA');
    expect(usaRecord.baseSalary).toBe(5000);
    expect(pkRecord.region).toBe('Pakistan');
    expect(pkRecord.baseSalary).toBe(150000);

    // Two records in, two records out — nothing here ever reduces/sums
    // records across employees (that would be a currency-blending bug),
    // and each record's baseSalary matches only its OWN employee's number.
    expect(records).toHaveLength(2);
    expect(records.map(r => r.baseSalary).sort((a, b) => a - b)).toEqual([5000, 150000]);
  });

  it('absence and leave deductions for a USA employee never pull from a Pakistan employee\'s figures or vice versa', () => {
    const usaEmp = makeProfile({ id: 'usa1', fullName: 'USA Employee', region: 'USA', baseSalary: 6000, email: 'usa@delcargo.us' });
    const pkEmp = makeProfile({ id: 'pk1', fullName: 'Pakistan Employee', region: 'Pakistan', baseSalary: 150000, email: 'pk@delcargo.us' });
    // One absence for the Pakistan employee only.
    const absences: AbsenceRecord[] = [{
      id: 'a1', employeeEmail: 'pk@delcargo.us', employeeName: 'Pakistan Employee', date: '2026-09-02',
      reason: 'no_clock_in', deductionAmount: 0, createdAt: '2026-09-02T00:00:00Z', acknowledged: false,
    }];
    const records = payrollActions.computePayrollView([usaEmp, pkEmp], [], [], [], absences);
    const usaRecord = records.find(r => r.employeeId === 'usa1')!;
    const pkRecord = records.find(r => r.employeeId === 'pk1')!;
    // The USA employee's deduction must be completely unaffected by a
    // Pakistan-only absence record — no cross-employee, and by extension no
    // cross-currency, leakage.
    expect(usaRecord.deductions).toBe(0);
    expect(pkRecord.deductions).toBeGreaterThan(0);
  });
});
