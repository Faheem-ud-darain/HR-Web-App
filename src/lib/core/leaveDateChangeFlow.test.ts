import { describe, it, expect } from 'vitest';
import { ChangeError, cancelChange, decideChange, requestChange, type LeaveChangeStore } from './leaveDateChangeFlow';
import type { LeaveDateChange } from './leaveDateChange';
import type { LeaveApplication } from '../hr/types';

const NOW = new Date('2026-11-02T16:00:00Z');
const ali = { id: 'p1', fullName: 'Ali Example', email: 'ali@x.us' };

function world(over: { leaves?: LeaveApplication[]; locked?: string[]; failMoveOnce?: boolean } = {}) {
  const w = {
    leaves: over.leaves ?? [{ id: 'l1', employeeName: 'Ali Example', type: 'Urgent', duration: 'Nov 10, 2026 - Nov 12, 2026', reason: 'x', status: 'approved' } as LeaveApplication],
    changes: [] as LeaveDateChange[],
    notes: [] as [string, string, string][],
    moves: [] as string[],
    failMove: !!over.failMoveOnce,
  };
  const store: LeaveChangeStore = {
    employeeByEmail: async e => (e === ali.email ? ali : null),
    employeeByName: async n => (n === ali.fullName ? ali : null),
    loadLeave: async id => w.leaves.find(l => l.id === id) ?? null,
    loadOwnLeaves: async n => w.leaves.filter(l => l.employeeName === n),
    lockedMonths: async (_id, months) => months.filter(m => (over.locked ?? []).includes(m)),
    pendingFor: async id => w.changes.find(c => c.leaveId === id && c.status === 'pending') ?? null,
    loadChange: async id => w.changes.find(c => c.id === id) ?? null,
    createChange: async c => { const row = { ...c, id: `c${w.changes.length + 1}` }; w.changes.push(row); return row; },
    updateChange: async (id, patch) => { w.changes = w.changes.map(c => (c.id === id ? { ...c, ...patch } : c)); },
    moveLeave: async (id, duration, start, end) => {
      if (w.failMove) { w.failMove = false; throw new Error('move failed'); }
      w.moves.push(duration);
      w.leaves = w.leaves.map(l => (l.id === id ? { ...l, duration, startDate: start, endDate: end } : l));
    },
    notify: async (to, role, message) => { w.notes.push([to, role, message]); },
  };
  return { w, store };
}
const ask = (store: LeaveChangeStore, over: Partial<Parameters<typeof requestChange>[1]> = {}) =>
  requestChange(store, { email: ali.email, leaveId: 'l1', newStart: '2026-11-17', newEnd: '2026-11-19', reason: 'Exam moved', now: NOW, ...over });

describe('requestChange', () => {
  it('records the request, leaves the leave as it is, and tells HR and Admin', async () => {
    const { w, store } = world();
    const c = await ask(store);
    expect(c).toMatchObject({ status: 'pending', oldStart: '2026-11-10', oldEnd: '2026-11-12', newStart: '2026-11-17', newEnd: '2026-11-19', employeeName: 'Ali Example' });
    expect(w.leaves[0].duration).toBe('Nov 10, 2026 - Nov 12, 2026');
    expect(w.notes.map(n => n[1])).toEqual(['hr', 'admin']);
    expect(w.notes[0][2]).toContain('from Nov 10, 2026 - Nov 12, 2026 to Nov 17, 2026 - Nov 19, 2026');
  });
  it('refuses someone else\'s leave, a missing leave and a second request for the same leave', async () => {
    const { store } = world();
    await expect(requestChange(store, { email: 'eve@x.us', leaveId: 'l1', newStart: '2026-11-17', newEnd: '2026-11-19', reason: 'x', now: NOW })).rejects.toMatchObject({ status: 404 });
    await expect(ask(store, { leaveId: 'nope' })).rejects.toMatchObject({ status: 404 });
    await ask(store);
    await expect(ask(store, { newStart: '2026-11-24', newEnd: '2026-11-24' })).rejects.toMatchObject({ status: 409 });
  });
  it('applies the rules: not in the past, not in a month whose pay is final, not on days already requested', async () => {
    await expect(ask(world().store, { newStart: '2026-11-01', newEnd: '2026-11-01' })).rejects.toThrow(/today or later/);
    await expect(ask(world({ locked: ['2026-11'] }).store)).rejects.toThrow(/already final/);
    const other = { id: 'l2', employeeName: 'Ali Example', type: 'Urgent', duration: 'Nov 18, 2026 - Nov 18, 2026', reason: '', status: 'pending' } as LeaveApplication;
    const { w, store } = world();
    w.leaves.push(other);
    await expect(ask(store)).rejects.toThrow(/already have a/);
  });
});

describe('cancelChange', () => {
  it('lets the employee withdraw a waiting request, once', async () => {
    const { w, store } = world();
    const c = await ask(store);
    await cancelChange(store, { email: ali.email, changeId: c.id });
    expect(w.changes[0].status).toBe('cancelled');
    await expect(cancelChange(store, { email: ali.email, changeId: c.id })).rejects.toMatchObject({ status: 409 });
    await expect(cancelChange(store, { email: 'eve@x.us', changeId: c.id })).rejects.toMatchObject({ status: 404 });
  });
});

describe('decideChange', () => {
  it('approving moves the leave to the new days, marks the request approved and tells the employee', async () => {
    const { w, store } = world();
    const c = await ask(store);
    w.notes.length = 0;
    const done = await decideChange(store, { changeId: c.id, decision: 'approve', decidedBy: 'HR Manager', now: NOW });
    expect(done).toMatchObject({ status: 'approved', decidedBy: 'HR Manager' });
    expect(w.leaves[0]).toMatchObject({ duration: 'Nov 17, 2026 - Nov 19, 2026', startDate: '2026-11-17', endDate: '2026-11-19' });
    expect(w.notes).toEqual([['ali@x.us', 'employee', expect.stringContaining('Nov 17, 2026')]]);
  });
  it('rejecting leaves the leave exactly as it was and tells the employee', async () => {
    const { w, store } = world();
    const c = await ask(store);
    await decideChange(store, { changeId: c.id, decision: 'reject', decidedBy: 'HR Manager', now: NOW });
    expect(w.leaves[0].duration).toBe('Nov 10, 2026 - Nov 12, 2026');
    expect(w.changes[0].status).toBe('rejected');
    expect(w.notes.at(-1)).toEqual(['ali@x.us', 'employee', expect.stringContaining('was not approved')]);
  });
  it('answers a request once only', async () => {
    const { store } = world();
    const c = await ask(store);
    await decideChange(store, { changeId: c.id, decision: 'approve', decidedBy: 'a', now: NOW });
    await expect(decideChange(store, { changeId: c.id, decision: 'reject', decidedBy: 'a', now: NOW })).rejects.toMatchObject({ status: 409 });
  });
  it('checks the rules again when approving: pay frozen since, or the leave already started', async () => {
    const a = world({ locked: [] });
    const c1 = await ask(a.store);
    const lockedNow = { ...a.store, lockedMonths: async (_: string, m: string[]) => m };
    await expect(decideChange(lockedNow, { changeId: c1.id, decision: 'approve', decidedBy: 'a', now: NOW })).rejects.toThrow(/already final/);
    expect(a.w.leaves[0].duration).toBe('Nov 10, 2026 - Nov 12, 2026');
    await expect(decideChange(a.store, { changeId: c1.id, decision: 'approve', decidedBy: 'a', now: new Date('2026-11-11T16:00:00Z') })).rejects.toThrow(/already started/);
  });
  it('can be pressed again after the leave was moved but the request was not marked, without moving twice', async () => {
    const { w, store } = world();
    const c = await ask(store);
    const flaky = { ...store, updateChange: store.updateChange };
    let fail = true;
    flaky.updateChange = async (id, patch) => { if (fail && patch.status === 'approved') { fail = false; throw new Error('mark failed'); } return store.updateChange(id, patch); };
    await expect(decideChange(flaky, { changeId: c.id, decision: 'approve', decidedBy: 'a', now: NOW })).rejects.toThrow('mark failed');
    expect(w.leaves[0].duration).toBe('Nov 17, 2026 - Nov 19, 2026');
    const done = await decideChange(flaky, { changeId: c.id, decision: 'approve', decidedBy: 'a', now: NOW });
    expect(done.status).toBe('approved');
    expect(w.moves).toHaveLength(1);
  });
  it('is a ChangeError with a status the route can return', () => {
    expect(new ChangeError('x', 409).status).toBe(409);
  });
});
