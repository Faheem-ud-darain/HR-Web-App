import { describe, expect, it } from 'vitest';
import { recordsInMonthScope, deductionMonths } from './absences';

const rec = (date: string) => ({ date });
const records = [rec('2026-11-13'), rec('2026-11-05'), rec('2026-10-30'), rec('2026-10-02'), rec('2026-09-15')];
const dates = (rs: { date: string }[]) => rs.map(r => r.date);

describe('recordsInMonthScope (the Absences page, both tabs, shows the running month; HR and Admin can pick another)', () => {
  it('shows only the chosen month', () => {
    expect(dates(recordsInMonthScope(records, { month: '2026-11' }))).toEqual(['2026-11-13', '2026-11-05']);
    expect(dates(recordsInMonthScope(records, { month: '2026-10' }))).toEqual(['2026-10-30', '2026-10-02']);
  });
  it('shows every month when asked for all', () => {
    expect(recordsInMonthScope(records, { month: 'all' })).toHaveLength(5);
  });
  it('shows nothing for a month with no records, never the earlier months', () => {
    expect(recordsInMonthScope(records, { month: '2026-12' })).toEqual([]);
  });
  it('a chosen day shows that day even outside the chosen month (HR and Admin)', () => {
    expect(dates(recordsInMonthScope(records, { month: '2026-11', date: '2026-10-30' }))).toEqual(['2026-10-30']);
  });
  it("an employee's own list never reaches back past the running month, even when a day is picked", () => {
    expect(dates(recordsInMonthScope(records, { month: '2026-11', ownOnly: true }))).toEqual(['2026-11-13', '2026-11-05']);
    expect(recordsInMonthScope(records, { month: '2026-11', date: '2026-10-30', ownOnly: true })).toEqual([]);
    expect(dates(recordsInMonthScope(records, { month: '2026-11', date: '2026-11-05', ownOnly: true }))).toEqual(['2026-11-05']);
  });
  it('the month chips are the months that have records, plus the running month, newest first', () => {
    expect(deductionMonths(records, '2026-11')).toEqual(['2026-11', '2026-10', '2026-09']);
    expect(deductionMonths([rec('2026-09-15')], '2026-11')).toEqual(['2026-11', '2026-09']); // the running month is offered even with no records yet
  });
});
