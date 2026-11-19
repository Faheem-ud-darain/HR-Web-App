import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LeaveApplication, Profile, TimesheetEntry } from './types';

const calls: string[] = [];
const fail = new Set<string>();
const step = (name: string, result: unknown = undefined) => vi.fn(async (..._args: unknown[]) => { calls.push(name); if (fail.has(name)) throw new Error(`${name} failed`); return result; });

const actions = {
  autoCloseOrphanTrackedShifts: step('orphan'),
  autoCloseStaleOpenShifts: step('stale'),
  getInactivityLogs: step('logs', [{ id: 'log1' }]),
  runAbsenceCheck: step('check'),
};
vi.mock('../hrData', () => ({ hrActions: actions }));
const strictLeaves = [{ id: 'leave-from-server' }] as unknown as LeaveApplication[];
vi.mock('./leaves', () => ({ fetchLeavesStrict: step('leaves', strictLeaves) }));
const { runAttendanceSweep } = await import('./attendanceSweep');

const people = [{ id: 'p1' }] as Profile[];
const shifts = [{ id: 't1' }] as TimesheetEntry[];
const leaves = [] as LeaveApplication[];
const NOW = new Date('2026-10-30T12:00:00Z');

beforeEach(() => { calls.length = 0; fail.clear(); vi.clearAllMocks(); });

describe('runAttendanceSweep', () => {
  it('closes orphan shifts, then stale shifts, then reads inactivity logs, then checks absences, in that order', async () => {
    await runAttendanceSweep(people, shifts, leaves, NOW);
    expect(calls).toEqual(['orphan', 'stale', 'leaves', 'logs', 'check']);
  });

  it('looks back five days for inactivity and passes the logs on to the absence check', async () => {
    await runAttendanceSweep(people, shifts, leaves, NOW);
    expect(actions.getInactivityLogs).toHaveBeenCalledWith({ sinceISO: new Date('2026-10-25T12:00:00Z').toISOString(), minDurationSeconds: 37 * 60, strict: true });
    expect(actions.runAbsenceCheck).toHaveBeenCalledWith(people, shifts, strictLeaves, [{ id: 'log1' }]); // the leaves come from a fresh strict read, not from the screen
  });

  it('carries on to the next step when one fails, and never throws', async () => {
    fail.add('orphan');
    await expect(runAttendanceSweep(people, shifts, leaves, NOW)).resolves.toBeUndefined();
    expect(calls).toEqual(['orphan', 'stale', 'leaves', 'logs', 'check']);
  });

  it('does not run the absence check on a guess when the inactivity logs cannot be read', async () => {
    fail.add('logs');
    await runAttendanceSweep(people, shifts, leaves, NOW);
    expect(calls).not.toContain('check');
  });

  it('does not run the absence check when the approved leaves cannot be read (an empty list would mark people on leave absent)', async () => {
    fail.add('leaves');
    await runAttendanceSweep(people, shifts, leaves, NOW);
    expect(calls).not.toContain('check');
    expect(actions.runAbsenceCheck).not.toHaveBeenCalled();
  });
});
