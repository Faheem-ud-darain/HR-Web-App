import { describe, it, expect } from 'vitest';
import { planCorrection, correctionsFor, outstandingTotals, currentAmount, type PayrollCorrection } from './payrollCorrections';

const c = (over: Partial<PayrollCorrection>): PayrollCorrection => ({
  id: 'c', employeeId: 'p1', employeeName: 'A', month: '2026-09', region: 'Pakistan', previousAmount: 40000, correctedAmount: 38000, difference: -2000,
  reason: 'wrong deduction', createdAt: '2026-10-10T10:00:00Z', createdBy: 'hr@x.us', createdByRole: 'hr', settled: false, ...over,
});

describe('planCorrection', () => {
  it('computes the difference against what was paid (negative = overpaid, to recover)', () => {
    expect(planCorrection({ paidAmount: 40000, earlier: [], correctedAmount: 38000, reason: 'Absence was approved leave' }))
      .toEqual({ ok: true, previousAmount: 40000, correctedAmount: 38000, difference: -2000, reason: 'Absence was approved leave' });
    expect(planCorrection({ paidAmount: 40000, earlier: [], correctedAmount: 43500, reason: 'Bonus was missed' }))
      .toMatchObject({ ok: true, difference: 3500 });
  });
  it('a second correction is measured against the first one, not the original payment', () => {
    const plan = planCorrection({ paidAmount: 40000, earlier: [{ correctedAmount: 38000, createdAt: '2026-10-10T10:00:00Z' }], correctedAmount: 39000, reason: 'Partly reversed' });
    expect(plan).toMatchObject({ ok: true, previousAmount: 38000, difference: 1000 });
  });
  it('needs a real reason and a sensible amount, and refuses a no-change correction', () => {
    expect(planCorrection({ paidAmount: 40000, earlier: [], correctedAmount: 38000, reason: '  ' })).toMatchObject({ ok: false });
    expect(planCorrection({ paidAmount: 40000, earlier: [], correctedAmount: 38000, reason: 'abc' })).toMatchObject({ ok: false });
    expect(planCorrection({ paidAmount: 40000, earlier: [], correctedAmount: -5, reason: 'valid reason' })).toMatchObject({ ok: false });
    expect(planCorrection({ paidAmount: 40000, earlier: [], correctedAmount: 'x', reason: 'valid reason' })).toMatchObject({ ok: false });
    expect(planCorrection({ paidAmount: 40000, earlier: [], correctedAmount: NaN, reason: 'valid reason' })).toMatchObject({ ok: false });
    expect(planCorrection({ paidAmount: 40000, earlier: [], correctedAmount: 40000, reason: 'same amount' })).toMatchObject({ ok: false });
    expect(planCorrection({ paidAmount: 40000, earlier: [], correctedAmount: 38000, reason: 'x'.repeat(501) })).toMatchObject({ ok: false });
  });
  it('rounds to cents', () => {
    expect(planCorrection({ paidAmount: 100, earlier: [], correctedAmount: 100.456, reason: 'rounding check' })).toMatchObject({ ok: true, correctedAmount: 100.46, difference: 0.46 });
  });
});

describe('helpers', () => {
  const all = [c({ id: '1' }), c({ id: '2', createdAt: '2026-10-12T10:00:00Z', correctedAmount: 39000, difference: 1000 }), c({ id: '3', employeeId: 'p2', region: 'USA', difference: 50, settled: true }), c({ id: '4', employeeId: 'p3', region: 'USA', difference: -20 })];
  it('lists one employee-month oldest first', () => {
    expect(correctionsFor(all, 'p1', '2026-09').map(x => x.id)).toEqual(['1', '2']);
    expect(correctionsFor(all, 'p1', '2026-08')).toEqual([]);
  });
  it('totals the unsettled differences per currency, never mixing them', () => {
    expect(outstandingTotals(all)).toEqual({ pakistan: -1000, usa: -20, count: 3 });
  });
  it('knows the amount the month stands at now', () => {
    expect(currentAmount(40000, [])).toBe(40000);
    expect(currentAmount(40000, [all[0], all[1]])).toBe(39000);
  });
});
