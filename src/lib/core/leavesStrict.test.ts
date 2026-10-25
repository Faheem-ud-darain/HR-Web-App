import { describe, it, expect } from 'vitest';
import { parseLeaveDay, parseLeaveDateStrings, countApprovedLeaveRequestsInMonth } from './leaves';
import type { LeaveApplication } from '../hr/types';

describe('parseLeaveDay is strict (the result is stored as the authoritative leave range)', () => {
  it('accepts real days in every supported spelling', () => {
    expect(parseLeaveDay('2026-09-03')).toBe('2026-09-03');
    expect(parseLeaveDay('Sep 03, 2026')).toBe('2026-09-03');
    expect(parseLeaveDay('September 3 2026')).toBe('2026-09-03');
    expect(parseLeaveDay('2026-09-03T00:00:00.000Z')).toBe('2026-09-03');
    expect(parseLeaveDay('2026-09-03 00:00:00.000Z')).toBe('2026-09-03');
    expect(parseLeaveDay('2028-02-29')).toBe('2028-02-29'); // a real leap day
  });
  it('rejects impossible days instead of storing them', () => {
    expect(parseLeaveDay('2026-02-31')).toBeNull();
    expect(parseLeaveDay('2026-02-29')).toBeNull(); // 2026 is not a leap year
    expect(parseLeaveDay('Feb 31, 2026')).toBeNull();
    expect(parseLeaveDay('Apr 31, 2026')).toBeNull();
    expect(parseLeaveDay('2026-13-01')).toBeNull();
    expect(parseLeaveDay('2026-00-10')).toBeNull();
    expect(parseLeaveDay('2026-09-00')).toBeNull();
  });
  it('rejects text with anything extra after the date', () => {
    expect(parseLeaveDay('2026-09-03 and something else')).toBeNull();
    expect(parseLeaveDay('2026-09-03abc')).toBeNull();
    expect(parseLeaveDay('Sep 03, 2026 (half day)')).toBeNull();
    expect(parseLeaveDay('')).toBeNull();
  });
});

describe('parseLeaveDateStrings', () => {
  it('reads a single day and a normal range, in either order', () => {
    expect(parseLeaveDateStrings('Sep 03, 2026')).toEqual({ start: '2026-09-03', end: '2026-09-03' });
    expect(parseLeaveDateStrings('Sep 03, 2026 - Sep 04, 2026')).toEqual({ start: '2026-09-03', end: '2026-09-04' });
    expect(parseLeaveDateStrings('Sep 04, 2026 - Sep 03, 2026')).toEqual({ start: '2026-09-03', end: '2026-09-04' });
  });
  it('refuses a duration with more than two endpoints or an impossible day', () => {
    expect(parseLeaveDateStrings('Sep 03, 2026 - Sep 04, 2026 - Sep 09, 2026')).toBeNull();
    expect(parseLeaveDateStrings('Sep 03, 2026 - Feb 31, 2026')).toBeNull();
  });
});

describe('countApprovedLeaveRequestsInMonth', () => {
  const leave = (duration: string): LeaveApplication => ({ id: 'l', employeeName: 'A', type: 'Urgent', duration, reason: '', status: 'approved' } as LeaveApplication);
  it('counts a leave that touches the month at either end', () => {
    expect(countApprovedLeaveRequestsInMonth([leave('Aug 28, 2026 - Sep 02, 2026')], 'A', 'Urgent', '2026-09')).toBe(1);
    expect(countApprovedLeaveRequestsInMonth([leave('Sep 28, 2026 - Oct 02, 2026')], 'A', 'Urgent', '2026-09')).toBe(1);
  });
  it('counts a leave that spans the whole month (neither end is in it)', () => {
    expect(countApprovedLeaveRequestsInMonth([leave('Aug 15, 2026 - Oct 15, 2026')], 'A', 'Urgent', '2026-09')).toBe(1);
  });
  it('does not count a leave that is entirely outside the month', () => {
    expect(countApprovedLeaveRequestsInMonth([leave('Aug 10, 2026 - Aug 20, 2026')], 'A', 'Urgent', '2026-09')).toBe(0);
    expect(countApprovedLeaveRequestsInMonth([leave('Oct 10, 2026 - Oct 20, 2026')], 'A', 'Urgent', '2026-09')).toBe(0);
  });
});
