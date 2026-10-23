import { describe, it, expect } from 'vitest';
import { canReviewPreviousMonthPayroll, computePayrollView, previousPayrollMonthKey } from './payroll';
import type { Profile } from '../hr/types';

const at = (iso: string) => new Date(`${iso}T16:00:00Z`); // midday New York

describe('previous-month payroll review window', () => {
  it('offers the extra tab only on New York days 4–10', () => {
    expect(canReviewPreviousMonthPayroll(at('2026-11-03'))).toBe(false); // main view already is last month
    expect(canReviewPreviousMonthPayroll(at('2026-11-04'))).toBe(true);
    expect(canReviewPreviousMonthPayroll(at('2026-11-10'))).toBe(true);
    expect(canReviewPreviousMonthPayroll(at('2026-11-11'))).toBe(false);
  });

  it('names the previous calendar month, across a year boundary too', () => {
    expect(previousPayrollMonthKey(at('2026-11-07'))).toBe('2026-10');
    expect(previousPayrollMonthKey(at('2027-01-05'))).toBe('2026-12');
  });

  it('computes last month only when asked, and never moves the default view', () => {
    const emp = { id: 'e1', fullName: 'Test User', email: 't@x.us', role: 'employee', region: 'USA', baseSalary: 3000, joinedDate: '2025-01-01', teams: [] } as unknown as Profile;
    const now = at('2026-11-07');
    expect(computePayrollView([emp], [], [], [], [], now)[0].month).toBe('2026-11');
    expect(computePayrollView([emp], [], [], [], [], now, true)[0].month).toBe('2026-10');
    // inside the processing window the default is already last month
    expect(computePayrollView([emp], [], [], [], [], at('2026-11-02'))[0].month).toBe('2026-10');
  });
});
