import { describe, it, expect } from 'vitest';
import { canChangeDates, formatLeaveDay, formatLeaveDuration, monthsTouched, validateDateChange } from './leaveDateChange';
import { parseLeaveDateStrings } from './leaves';
import type { LeaveApplication } from '../hr/types';

const TODAY = '2026-11-02';
const leave = (over: Partial<LeaveApplication> = {}): LeaveApplication => ({ id: 'l1', employeeName: 'Ali Example', type: 'Urgent', duration: 'Nov 10, 2026 - Nov 12, 2026', reason: 'x', status: 'approved', ...over }) as LeaveApplication;
const check = (over: Partial<Parameters<typeof validateDateChange>[0]> = {}) =>
  validateDateChange({ leave: leave(), newStart: '2026-11-17', newEnd: '2026-11-19', reason: 'Exam moved', today: TODAY, ownLeaves: [leave()], lockedMonths: [], ...over });

describe('formatting', () => {
  it('writes days the way the leave form does, and they read back', () => {
    expect(formatLeaveDay('2026-11-03')).toBe('Nov 03, 2026');
    expect(formatLeaveDuration('2026-11-10', '2026-11-12')).toBe('Nov 10, 2026 - Nov 12, 2026');
    expect(parseLeaveDateStrings(formatLeaveDuration('2026-12-30', '2027-01-02'))).toEqual({ start: '2026-12-30', end: '2027-01-02' });
  });
  it('lists every month a range touches', () => {
    expect(monthsTouched({ start: '2026-10-30', end: '2026-11-03' }, { start: '2026-12-01', end: '2026-12-01' })).toEqual(['2026-10', '2026-11', '2026-12']);
  });
});

describe('canChangeDates', () => {
  it('is offered for a request that has not started and has not been rejected', () => {
    expect(canChangeDates(leave(), TODAY)).toBe(true);
    expect(canChangeDates(leave({ status: 'pending' }), TODAY)).toBe(true);
    expect(canChangeDates(leave({ status: 'rejected' }), TODAY)).toBe(false);
    expect(canChangeDates(leave({ duration: 'Nov 01, 2026 - Nov 04, 2026' }), TODAY)).toBe(false);
    expect(canChangeDates(leave({ duration: 'unreadable' }), TODAY)).toBe(false);
  });
});

describe('validateDateChange', () => {
  it('allows moving an approved leave that has not started to other days', () => {
    expect(check()).toBeNull();
  });
  it('also allows it while the request is still waiting for HR or the CEO', () => {
    expect(check({ leave: leave({ status: 'pending' }) })).toBeNull();
    expect(check({ leave: leave({ status: 'hr_approved' }) })).toBeNull();
  });
  it('needs both dates, in order, and a reason', () => {
    expect(check({ newStart: '' })).toMatch(/both dates/);
    expect(check({ newStart: '2026-11-19', newEnd: '2026-11-17' })).toMatch(/cannot be before/);
    expect(check({ reason: '   ' })).toMatch(/why/);
  });
  it('refuses a rejected request', () => {
    expect(check({ leave: leave({ status: 'rejected' }) })).toMatch(/rejected/);
  });
  it('refuses a leave that has already started, or whose dates cannot be read', () => {
    expect(check({ leave: leave({ duration: 'Nov 01, 2026 - Nov 04, 2026' }) })).toMatch(/already started or finished/);
    expect(check({ leave: leave({ duration: 'sometime' }) })).toMatch(/no readable dates/);
  });
  it('does not allow new dates in the past', () => {
    expect(check({ newStart: '2026-11-01', newEnd: '2026-11-03' })).toMatch(/today or later/);
    expect(check({ newStart: TODAY, newEnd: TODAY })).toBeNull();
  });
  it('keeps the 14 days notice for Normal leave on the new dates', () => {
    const normal = leave({ type: 'Normal', duration: 'Nov 20, 2026 - Nov 20, 2026' });
    expect(check({ leave: normal, ownLeaves: [normal], newStart: '2026-11-10', newEnd: '2026-11-10' })).toMatch(/14 days/);
    expect(check({ leave: normal, ownLeaves: [normal], newStart: '2026-11-16', newEnd: '2026-11-16' })).toBeNull();
    expect(check({ leave: normal, ownLeaves: [normal], newStart: '2026-11-15', newEnd: '2026-11-15' })).toMatch(/14 days/);
  });
  it('refuses the same dates', () => {
    expect(check({ newStart: '2026-11-10', newEnd: '2026-11-12' })).toMatch(/same dates/);
  });
  it('refuses new days that another of their requests already covers, but not the request being moved', () => {
    const other = leave({ id: 'l2', duration: 'Nov 18, 2026 - Nov 18, 2026', status: 'pending' });
    expect(check({ ownLeaves: [leave(), other] })).toMatch(/already have a/);
    expect(check({ newStart: '2026-11-11', newEnd: '2026-11-13' })).toBeNull(); // overlaps only itself
    expect(check({ ownLeaves: [leave(), { ...other, status: 'rejected' }] })).toBeNull();
  });
  it('refuses when the old or the new dates are in a month whose pay is already final', () => {
    expect(check({ lockedMonths: ['2026-11'] })).toMatch(/November 2026 is already final/);
    expect(check({ newStart: '2026-12-03', newEnd: '2026-12-03', lockedMonths: ['2026-12'] })).toMatch(/December 2026/);
    expect(check({ lockedMonths: ['2026-10'] })).toBeNull();
  });
});
