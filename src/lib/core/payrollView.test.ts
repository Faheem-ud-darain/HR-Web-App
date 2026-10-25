import { describe, it, expect } from 'vitest';
import { netPay, groupDeductions, payrollFlags, hasBankDetails, summarizePayroll, monthLabel, groupOfRegion, payPeriod } from './payrollView';
import type { PayrollRecord } from '../hr/types';

function rec(over: Partial<PayrollRecord> = {}): PayrollRecord {
  return { id: 'r', employeeId: 'p1', name: 'Alex', role: 'Agent', region: 'Pakistan', baseSalary: 44000, unpaidLeaves: 0, bonus: 0, deductions: 0, processed: false, incrementAmount: 0, month: '2026-10', reservedThisMonth: 0, deductionBreakdown: [], pendingArrears: 0, ...over };
}
const bank = { bankName: 'HBL', accountNumber: '123', iban: '' };

describe('netPay', () => {
  it('includes the increment (one definition for rows, cards and the pay slip)', () => {
    expect(netPay(rec({ baseSalary: 44000, incrementAmount: 10000, bonus: 500, deductions: 4000 }))).toBe(50500);
  });
  it('treats missing numbers as zero', () => {
    expect(netPay({ baseSalary: 100, incrementAmount: NaN, bonus: undefined as unknown as number, deductions: 0 })).toBe(100);
  });
});

describe('groupDeductions', () => {
  it('collects the calculation labels into plain groups, in a fixed order, skipping empty ones', () => {
    const groups = groupDeductions([
      { label: 'Onboarding Not Completed', amount: 200 },
      { label: "Urgent Leave (1 day × 2 days' pay)", amount: 4000 },
      { label: 'Absence (no-show / under 4h / inactivity)', amount: 8000 },
      { label: 'Normal Leave (2 days × 1 day\'s pay)', amount: 4000 },
      { label: 'Partial Shifts (worked under 8h, at/above 4h)', amount: 1250 },
      { label: 'First-Month Reserve (not lost — paid at resignation/termination)', amount: 30000 },
    ]);
    expect(groups.map(g => [g.key, g.total])).toEqual([['hours', 1250], ['absence', 8000], ['leave', 8000], ['other', 200], ['held', 30000]]);
    expect(groups.find(g => g.key === 'leave')?.items).toHaveLength(2);
    expect(groupDeductions([])).toEqual([]);
  });
});

describe('payrollFlags', () => {
  it('is empty for a normal, payable employee', () => {
    expect(payrollFlags(rec(), bank)).toEqual([]);
  });
  it('flags missing bank details, earlier unpaid months, zero pay and large deductions', () => {
    expect(payrollFlags(rec(), { bankName: '', accountNumber: '', iban: '' }).map(f => f.kind)).toEqual(['no_bank']);
    expect(payrollFlags(rec(), undefined).map(f => f.kind)).toEqual(['no_bank']);
    expect(payrollFlags(rec({ pendingArrears: 100 }), bank).map(f => f.kind)).toEqual(['arrears']);
    expect(payrollFlags(rec({ deductions: 44000 }), bank).map(f => f.kind)).toEqual(['zero_net']);
    expect(payrollFlags(rec({ deductions: 30000 }), bank).map(f => f.kind)).toEqual(['big_deduction']);
  });
  it('does not call a first-month hold a problem', () => {
    expect(payrollFlags(rec({ deductions: 44000, reservedThisMonth: 44000 }), bank)).toEqual([]);
  });
  it('accepts an IBAN instead of an account number', () => {
    expect(hasBankDetails({ bankName: 'HBL', accountNumber: '', iban: 'PK00' })).toBe(true);
    expect(hasBankDetails({ bankName: '', accountNumber: '1', iban: '' })).toBe(false);
  });
});

describe('summarizePayroll', () => {
  it('counts people, paid, unpaid and those needing a look, and sums what is still to pay', () => {
    const profiles = new Map([['p1', bank], ['p2', bank]]); // p3 has no profile entry -> no bank details
    const t = summarizePayroll([
      rec({ employeeId: 'p1', baseSalary: 40000, processed: true }),
      rec({ employeeId: 'p2', baseSalary: 30000, incrementAmount: 10000 }),
      rec({ employeeId: 'p3', baseSalary: 20000 }),
    ], profiles);
    expect(t).toEqual({ people: 3, paid: 1, unpaid: 2, needsLook: 1, toPay: 60000, total: 100000 });
  });
});

describe('labels', () => {
  it('formats months and picks the currency group', () => {
    expect(monthLabel('2026-10')).toBe('October 2026');
    expect(monthLabel('bad')).toBe('bad');
    expect(groupOfRegion('USA')).toBe('usa');
    expect(groupOfRegion('Pakistan')).toBe('pakistan');
    expect(groupOfRegion(undefined)).toBe('pakistan');
  });
});

describe('payPeriod', () => {
  it('says which month the salary is for and which month it is paid in', () => {
    expect(payPeriod('2026-09')).toEqual({ salaryMonth: 'September 2026', paidMonth: 'October 2026' });
    expect(payPeriod('2026-12')).toEqual({ salaryMonth: 'December 2026', paidMonth: 'January 2027' });
    expect(payPeriod('bad')).toEqual({ salaryMonth: 'bad', paidMonth: '' });
  });
});

describe('new-joiner payments on the screen', () => {
  it('net pay includes the earlier part-month pay', () => {
    expect(netPay(rec({ baseSalary: 35000, earlierPay: 19194 }))).toBe(54194);
  });
  it('a set-aside part-month is not flagged as "zero pay", and is grouped as paid with a later salary', () => {
    const stub = rec({ baseSalary: 19194, deductions: 19194, deferredThisMonth: 19194, deductionBreakdown: [{ label: 'Part-month pay — paid with the October 2026 salary', amount: 19194 }] });
    expect(payrollFlags(stub, bank)).toEqual([]);
    expect(groupDeductions(stub.deductionBreakdown).map(g => g.key)).toEqual(['later']);
  });
});
