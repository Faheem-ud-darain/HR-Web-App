import { describe, it, expect } from 'vitest';
import { describeLeaveConflict, findLeaveConflict } from './leaves';
import type { LeaveApplication } from '../hr/types';

describe('findLeaveConflict (the same days cannot be requested twice)', () => {
  const req = (over: Partial<LeaveApplication>): LeaveApplication => ({ id: 'l1', employeeName: 'Ali Example', type: 'Urgent', duration: '2026-11-10 - 2026-11-10', reason: '', status: 'pending', ...over }) as LeaveApplication;

  it('finds a request for exactly the same day', () => {
    expect(findLeaveConflict([req({})], 'Ali Example', '2026-11-10', '2026-11-10')?.id).toBe('l1');
  });
  it('finds a request that only partly overlaps', () => {
    const l = req({ duration: '2026-11-10 - 2026-11-12' });
    expect(findLeaveConflict([l], 'Ali Example', '2026-11-12', '2026-11-14')).toBe(l);
    expect(findLeaveConflict([l], 'Ali Example', '2026-11-08', '2026-11-10')).toBe(l);
    expect(findLeaveConflict([l], 'Ali Example', '2026-11-11', '2026-11-11')).toBe(l);
  });
  it('lets different days through, including the day before and after', () => {
    const l = req({ duration: '2026-11-10 - 2026-11-12' });
    expect(findLeaveConflict([l], 'Ali Example', '2026-11-08', '2026-11-09')).toBeNull();
    expect(findLeaveConflict([l], 'Ali Example', '2026-11-13', '2026-11-14')).toBeNull();
  });
  it('counts a request waiting for HR, waiting for the CEO, or approved, but not a rejected one', () => {
    for (const status of ['pending', 'hr_approved', 'approved'] as const) expect(findLeaveConflict([req({ status })], 'Ali Example', '2026-11-10', '2026-11-10')).not.toBeNull();
    expect(findLeaveConflict([req({ status: 'rejected' })], 'Ali Example', '2026-11-10', '2026-11-10')).toBeNull();
  });
  it('ignores other people\'s requests, whatever the type', () => {
    expect(findLeaveConflict([req({ employeeName: 'Someone Else' })], 'Ali Example', '2026-11-10', '2026-11-10')).toBeNull();
    expect(findLeaveConflict([req({ type: 'Normal' })], 'Ali Example', '2026-11-10', '2026-11-10')).not.toBeNull(); // an Urgent and a Normal request for one day still clash
  });
  it('tells the employee what is in the way', () => {
    expect(describeLeaveConflict(req({}))).toContain('waiting for approval');
    expect(describeLeaveConflict(req({ status: 'approved' }))).toContain('(approved)');
    expect(describeLeaveConflict(req({ status: 'approved' }))).toContain('Choose different days.');
  });
});
