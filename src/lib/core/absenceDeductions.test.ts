import { describe, it, expect } from 'vitest';
import { INACTIVITY_THRESHOLD_SECONDS, deductionLines, deductionMonths } from './absences';

describe('deductionLines / deductionMonths', () => {
  const rec = (id: string, date: string, reason: 'no_clock_in' | 'inactivity' | 'under_4_hours', extra: object = {}) => ({ id, date, reason, deductionAmount: 5000, createdAt: '', ...extra });
  const none = () => null;
  it('lists the newest day first with a plain reason for each kind', () => {
    const lines = deductionLines([rec('a', '2026-10-02', 'no_clock_in'), rec('b', '2026-10-09', 'under_4_hours', { workedMinutes: 95 }), rec('c', '2026-10-05', 'inactivity', { inactivityMinutes: 52 })], none);
    expect(lines.map(l => l.id)).toEqual(['b', 'c', 'a']);
    expect(lines[0].label).toBe('Only 1h 35m worked (the minimum is 4 hours)');
    expect(lines[1].label).toContain('52 minutes');
    expect(lines[1].label).toContain(`the limit is ${INACTIVITY_THRESHOLD_SECONDS / 60}`);
    expect(lines[2]).toMatchObject({ label: "Didn't start a shift that day", amount: 5000, covered: false });
  });
  it('charges nothing for a day an approved leave now covers', () => {
    const [line] = deductionLines([rec('a', '2026-10-02', 'no_clock_in')], () => ({ type: 'Sick' }) as never);
    expect(line).toMatchObject({ amount: 0, covered: true });
    expect(line.label).toContain('Sick leave');
  });
  it('never takes more than the pay: the oldest days use it up first', () => {
    const lines = deductionLines([rec('a', '2026-10-02', 'no_clock_in'), rec('b', '2026-10-09', 'no_clock_in'), rec('c', '2026-10-16', 'no_clock_in')], none, 12000);
    expect(lines.map(l => [l.id, l.amount, l.shortBy])).toEqual([['c', 2000, 3000], ['b', 5000, 0], ['a', 5000, 0]]);
    expect(lines.reduce((sum, l) => sum + l.amount, 0)).toBe(12000);
    expect(deductionLines([rec('a', '2026-10-02', 'no_clock_in')], none, 0)[0]).toMatchObject({ amount: 0, shortBy: 5000 });
  });
  it('gives the months with deductions, always including the current one, newest first', () => {
    expect(deductionMonths([{ date: '2026-08-04' }, { date: '2026-10-09' }, { date: '2026-08-20' }], '2026-10')).toEqual(['2026-10', '2026-08']);
    expect(deductionMonths([{ date: '2026-08-04' }], '2026-10')).toEqual(['2026-10', '2026-08']);
    expect(deductionMonths([], '2026-10')).toEqual(['2026-10']);
  });
});
