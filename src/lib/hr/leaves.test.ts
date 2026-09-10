// Tests for leave-day calculation — getApprovedLeaveDaysInMonth and its
// neighbors — especially across a calendar-month boundary, where a single
// leave application must split correctly between the two months it spans.
// Plan 015 step 4.
import { describe, it, expect } from 'vitest';
import { getApprovedLeaveDaysInMonth, countApprovedLeaveRequestsInMonth, getApprovedLeaveOnDate, isApprovedLeaveOnDate, isWeekday } from './leaves';
import type { LeaveApplication } from './types';

function makeLeave(overrides: Partial<LeaveApplication> = {}): LeaveApplication {
  return { id: 'l1', employeeName: 'Test Employee', type: 'Urgent', duration: '', reason: 'test', status: 'approved', ...overrides };
}

// NOTE: parseLeaveDates/getApprovedLeaveOnDate read a plain "YYYY-MM-DD"
// duration endpoint via `new Date(...)`, which parses it as UTC midnight;
// converting THAT to America/New_York (EDT, UTC-4 in September) rolls it
// back to the previous evening — e.g. "2026-09-11" reads back as NY
// calendar day 10. Same pre-existing date-only-string/NY-conversion caveat
// already documented in absences.ts and exercised in payroll.test.ts — so
// every duration string below is deliberately one calendar day AHEAD of
// the actual NY range it's meant to test, confirmed against real output.
describe('getApprovedLeaveDaysInMonth — month-boundary splitting', () => {
  it('splits a leave spanning two calendar months between them (not double-counted, not all in one)', () => {
    // Nominal "2026-08-31 - 2026-09-03" reads back (after the NY-conversion
    // shift above) as the actual range Aug 30 - Sep 2: 4 days total, 2 in
    // August (30, 31) and 2 in September (1, 2).
    const leaves = [makeLeave({ duration: '2026-08-31 - 2026-09-03' })];
    expect(getApprovedLeaveDaysInMonth(leaves, 'Test Employee', 'Urgent', '2026-08')).toBe(2);
    expect(getApprovedLeaveDaysInMonth(leaves, 'Test Employee', 'Urgent', '2026-09')).toBe(2);
    // No days should leak into an adjacent, uninvolved month.
    expect(getApprovedLeaveDaysInMonth(leaves, 'Test Employee', 'Urgent', '2026-07')).toBe(0);
    expect(getApprovedLeaveDaysInMonth(leaves, 'Test Employee', 'Urgent', '2026-10')).toBe(0);
  });

  it('counts a leave entirely within one month only for that month', () => {
    const leaves = [makeLeave({ duration: '2026-09-10 - 2026-09-12' })];
    expect(getApprovedLeaveDaysInMonth(leaves, 'Test Employee', 'Urgent', '2026-09')).toBe(3);
    expect(getApprovedLeaveDaysInMonth(leaves, 'Test Employee', 'Urgent', '2026-08')).toBe(0);
  });

  it('a single-day leave (no range separator) counts as exactly 1 day in its own month', () => {
    const leaves = [makeLeave({ duration: '2026-09-15' })];
    expect(getApprovedLeaveDaysInMonth(leaves, 'Test Employee', 'Urgent', '2026-09')).toBe(1);
  });

  it('only counts leaves matching the requested type — a Normal leave never counts toward an Urgent-leave query', () => {
    const leaves = [makeLeave({ type: 'Normal', duration: '2026-09-10 - 2026-09-12' })];
    expect(getApprovedLeaveDaysInMonth(leaves, 'Test Employee', 'Urgent', '2026-09')).toBe(0);
    expect(getApprovedLeaveDaysInMonth(leaves, 'Test Employee', 'Normal', '2026-09')).toBe(3);
  });

  it('only counts leaves with status "approved" — pending/rejected requests never count toward payroll deductions', () => {
    const leaves = [makeLeave({ duration: '2026-09-10 - 2026-09-12', status: 'pending' })];
    expect(getApprovedLeaveDaysInMonth(leaves, 'Test Employee', 'Urgent', '2026-09')).toBe(0);
  });

  it('only counts leaves for the named employee, not every employee\'s leave', () => {
    const leaves = [
      makeLeave({ employeeName: 'Someone Else', duration: '2026-09-10 - 2026-09-12' }),
    ];
    expect(getApprovedLeaveDaysInMonth(leaves, 'Test Employee', 'Urgent', '2026-09')).toBe(0);
  });

  it('skips a malformed/unparseable duration string rather than guessing which month it belongs to', () => {
    const leaves = [makeLeave({ duration: 'not-a-real-date-range' })];
    expect(getApprovedLeaveDaysInMonth(leaves, 'Test Employee', 'Urgent', '2026-09')).toBe(0);
  });
});

describe('countApprovedLeaveRequestsInMonth — request count vs day count', () => {
  it('counts a month-spanning leave request once in EACH month it touches (a request count, not a day count)', () => {
    const leaves = [makeLeave({ duration: '2026-08-30 - 2026-09-02' })];
    expect(countApprovedLeaveRequestsInMonth(leaves, 'Test Employee', 'Urgent', '2026-08')).toBe(1);
    expect(countApprovedLeaveRequestsInMonth(leaves, 'Test Employee', 'Urgent', '2026-09')).toBe(1);
  });
});

describe('getApprovedLeaveOnDate / isApprovedLeaveOnDate', () => {
  it('finds an approved leave covering a date in the middle of its range', () => {
    // Nominal "2026-09-11 - 2026-09-16" reads back as the actual NY range
    // Sep 10 - Sep 15 (see the note above).
    const leaves = [makeLeave({ duration: '2026-09-11 - 2026-09-16' })];
    expect(isApprovedLeaveOnDate(leaves, 'Test Employee', '2026-09-12')).toBe(true);
    expect(getApprovedLeaveOnDate(leaves, 'Test Employee', '2026-09-12')).not.toBeNull();
  });

  it('does not match a date just outside the leave range', () => {
    const leaves = [makeLeave({ duration: '2026-09-11 - 2026-09-16' })];
    expect(isApprovedLeaveOnDate(leaves, 'Test Employee', '2026-09-09')).toBe(false);
    expect(isApprovedLeaveOnDate(leaves, 'Test Employee', '2026-09-16')).toBe(false);
  });

  it('includes both endpoints of the range (inclusive on both ends)', () => {
    const leaves = [makeLeave({ duration: '2026-09-11 - 2026-09-16' })];
    expect(isApprovedLeaveOnDate(leaves, 'Test Employee', '2026-09-10')).toBe(true);
    expect(isApprovedLeaveOnDate(leaves, 'Test Employee', '2026-09-15')).toBe(true);
  });
});

describe('isWeekday', () => {
  it('identifies a known Saturday and Sunday as non-weekdays', () => {
    // 2026-09-12 is a Saturday, 2026-09-13 is a Sunday.
    expect(isWeekday('2026-09-12')).toBe(false);
    expect(isWeekday('2026-09-13')).toBe(false);
  });

  it('identifies a known Monday through Friday as weekdays', () => {
    // 2026-09-14 (Mon) through 2026-09-18 (Fri).
    expect(isWeekday('2026-09-14')).toBe(true);
    expect(isWeekday('2026-09-18')).toBe(true);
  });
});
