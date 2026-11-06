import { describe, expect, it } from 'vitest';
import type { AbsenceRecord } from '../hr/types';
import { ABSENCE_PENALTY_DAYS, absenceDayCharge } from './absences';
import { FIRST_MONTH_CUTOFF_DAY, getAbsenceDeductionForMonth } from './payroll';
import { FULL_DAY_MINUTES, absenceFloorMinutes } from './workDay';
import { getWeekdaysInMonth } from './dates';

const rec = (date: string): AbsenceRecord => ({ id: date, employeeEmail: 'a@x.com', employeeName: 'A', date, reason: 'no_clock_in', deductionAmount: 99999, createdAt: '', acknowledged: false } as unknown as AbsenceRecord);

describe('the absence charge', () => {
  it('is two days of pay at the salary given, for the month of the date', () => {
    const weekdays = getWeekdaysInMonth('2026-09');
    expect(absenceDayCharge(60000, '2026-09-14')).toBe(Math.round(ABSENCE_PENALTY_DAYS * 60000 / weekdays));
    expect(absenceDayCharge(0, '2026-09-14')).toBe(0);
    expect(absenceDayCharge(NaN, '2026-09-14')).toBe(0);
  });

  it('payroll is the per-day charge times the days charged, so a screen adding the days up always matches the pay slip', () => {
    const records = ['2026-09-01', '2026-09-02', '2026-09-03'].map(rec);
    for (const salary of [20000, 61337, 130000]) {
      expect(getAbsenceDeductionForMonth(records, 'a@x.com', salary, '2026-09')).toBe(3 * absenceDayCharge(salary, '2026-09-10'));
    }
  });

  it('follows a salary correction: the old stored amount on the record is never used', () => {
    const records = [rec('2026-09-01')];
    expect(getAbsenceDeductionForMonth(records, 'a@x.com', 20000, '2026-09')).toBe(absenceDayCharge(20000, '2026-09-01'));
    expect(getAbsenceDeductionForMonth(records, 'a@x.com', 20000, '2026-09')).not.toBe(99999);
  });
});

describe('shared work-day rules', () => {
  it('are defined once', () => {
    expect([absenceFloorMinutes(null), FULL_DAY_MINUTES, FIRST_MONTH_CUTOFF_DAY]).toEqual([240, 480, 5]);
  });
});
