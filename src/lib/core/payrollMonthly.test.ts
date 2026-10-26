import { describe, it, expect } from 'vitest';
import { decideIncrement, monthToFreeze } from './payrollMonthly';

const emp = (o: Partial<Parameters<typeof decideIncrement>[0]> = {}) => ({
  salaryStartDate: '2025-07-13', region: 'Pakistan', baseSalary: 50000, ...o,
});

describe('monthToFreeze', () => {
  it('is always last month', () => {
    expect(monthToFreeze('2026-10-01')).toBe('2026-09');
    expect(monthToFreeze('2027-01-01')).toBe('2026-12');
  });
});

describe('decideIncrement', () => {
  it('applies the raise in the month after the anniversary', () => {
    const d = decideIncrement(emp(), '2026-08');
    expect(d).toMatchObject({ status: 'apply', perEvent: 10000, newBaseSalary: 60000, processedThroughYear: 2026, anniversaryMonth: '2026-07' });
  });
  it('does nothing in the anniversary month itself or earlier', () => {
    expect(decideIncrement(emp(), '2026-07').status).toBe('none');
    expect(decideIncrement(emp(), '2026-06').status).toBe('none');
  });
  it('uses 100 for USA', () => {
    expect(decideIncrement(emp({ region: 'USA', baseSalary: 2000 }), '2026-08')).toMatchObject({ status: 'apply', newBaseSalary: 2100 });
  });
  it('does not apply twice once the year is recorded', () => {
    expect(decideIncrement(emp({ lastIncrementProcessedYear: 2026 }), '2026-08').status).toBe('none');
  });
  it('never back-fills an old missed raise', () => {
    const d = decideIncrement(emp(), '2026-10'); // July raise never applied, now October
    expect(d.status).toBe('skipped');
  });
  it('never back-fills two missed raises', () => {
    const d = decideIncrement(emp({ salaryStartDate: '2024-07-13' }), '2026-08');
    expect(d.status).toBe('skipped');
  });
  it('a moved start date moves the next raise to the same day a year later', () => {
    // raise for 2026 applied; next one is the 2027 anniversary
    const profile = emp({ lastIncrementProcessedYear: 2026 });
    expect(decideIncrement(profile, '2027-07').status).toBe('none');
    expect(decideIncrement(profile, '2027-08')).toMatchObject({ status: 'apply', processedThroughYear: 2027 });
  });
  it('skips when there is no usable date', () => {
    expect(decideIncrement(emp({ salaryStartDate: 'soon' }), '2026-08').status).toBe('none');
  });
});

import { toPayrollRecordFromRow } from './payrollMappers';

describe('reading a paid row that has no stored breakdown', () => {
  const row = { id: 'r', employee_id: 'e', employee_name: 'N', role: 'A', region: 'Pakistan', month: '2026-09', base_salary: 40000, bonus: 0, deductions: 1000, increment_amount: 0, net_pay: 54000, processed: true };
  it('is final, and recovers the part-month pay that was added to it', () => {
    const r = toPayrollRecordFromRow(row);
    expect(r.frozen).toBe(true);
    expect(r.earlierPay).toBe(15000);
    expect(r.baseSalary + r.bonus - r.deductions + r.incrementAmount + (r.earlierPay || 0)).toBe(54000);
    expect(r.deductionBreakdown).toEqual([{ label: 'Deductions at the time of payment', amount: 1000 }]);
  });
  it('an unpaid row stays live', () => {
    expect(toPayrollRecordFromRow({ ...row, processed: false }).frozen).toBe(false);
  });
});

describe('anniversary on the 1st reads as that calendar date in every time zone', () => {
  const first = { salaryStartDate: '2025-03-01', region: 'Pakistan', baseSalary: 50000 };
  it('nothing in March, raise from April', () => {
    expect(decideIncrement(first, '2026-03').status).toBe('none');
    expect(decideIncrement(first, '2026-04')).toMatchObject({ status: 'apply', anniversaryMonth: '2026-03' });
  });
});
