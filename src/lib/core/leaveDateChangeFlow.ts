// Plain TypeScript. The three things that can happen to a request to change a leave's dates, worked out on the server and
// talking to storage only through LeaveChangeStore (tested with an in-memory store, run with the PocketBase one in
// lib/server/leaveChangeStore.ts). The browser only says WHICH leave, the NEW dates, and a reason: whether the change is
// allowed is decided here, from the stored leave, never from anything the browser claims about it.
import { getNYDateString } from '../timezone';
import type { LeaveApplication } from '../hr/types';
import { getLeaveRange } from './leaves';
import { formatLeaveDay, formatLeaveDuration, monthsTouched, validateDateChange, type LeaveDateChange } from './leaveDateChange';

export interface LeaveChangeStore {
  /** The signed-in employee, found by email. */
  employeeByEmail(email: string): Promise<{ id: string; fullName: string; email: string } | null>;
  /** The employee a request or leave belongs to, found by name (leaves and requests only store the name). */
  employeeByName(fullName: string): Promise<{ id: string; fullName: string; email: string } | null>;
  loadLeave(leaveId: string): Promise<LeaveApplication | null>;
  /** All of one person's leave requests (any status). */
  loadOwnLeaves(fullName: string): Promise<LeaveApplication[]>;
  /** Which of these "YYYY-MM" months already have frozen or paid pay for this employee. */
  lockedMonths(employeeId: string, months: string[]): Promise<string[]>;
  pendingFor(leaveId: string): Promise<LeaveDateChange | null>;
  loadChange(changeId: string): Promise<LeaveDateChange | null>;
  createChange(change: Omit<LeaveDateChange, 'id'>): Promise<LeaveDateChange>;
  updateChange(changeId: string, patch: Partial<LeaveDateChange>): Promise<void>;
  /** Writes the leave's new duration text and start/end days. */
  moveLeave(leaveId: string, duration: string, start: string, end: string): Promise<void>;
  /** `to` is an employee's email, or 'hr' / 'admin' for everyone in that role. */
  notify(to: string, role: 'employee' | 'hr' | 'admin', message: string): Promise<void>;
}

export class ChangeError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 = 400) { super(message); }
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const range = (leave: LeaveApplication) => getLeaveRange(leave)!;
const describe = (c: Pick<LeaveDateChange, 'oldStart' | 'oldEnd' | 'newStart' | 'newEnd'>) =>
  `from ${formatLeaveDuration(c.oldStart, c.oldEnd)} to ${formatLeaveDuration(c.newStart, c.newEnd)}`;

async function problem(store: LeaveChangeStore, leave: LeaveApplication, employeeId: string, newStart: string, newEnd: string, reason: string, now: Date): Promise<string | null> {
  const old = getLeaveRange(leave);
  const months = old && newStart && newEnd && newStart <= newEnd ? monthsTouched(old, { start: newStart, end: newEnd }) : [];
  const [ownLeaves, lockedMonths] = await Promise.all([store.loadOwnLeaves(leave.employeeName), months.length ? store.lockedMonths(employeeId, months) : Promise.resolve([])]);
  return validateDateChange({ leave, newStart, newEnd, reason, today: getNYDateString(now), ownLeaves, lockedMonths });
}

/** An employee asks to move one of their leave requests to other days. */
export async function requestChange(store: LeaveChangeStore, input: { email: string; leaveId: string; newStart: string; newEnd: string; reason: string; now: Date }): Promise<LeaveDateChange> {
  const employee = await store.employeeByEmail(input.email);
  const leave = await store.loadLeave(input.leaveId);
  if (!employee || !leave || !same(leave.employeeName, employee.fullName)) throw new ChangeError('Leave request not found.', 404);
  if (await store.pendingFor(leave.id)) throw new ChangeError('You already asked to change this request. Cancel that first or wait for the answer.', 409);
  const why = await problem(store, leave, employee.id, input.newStart, input.newEnd, input.reason, input.now);
  if (why) throw new ChangeError(why);
  const old = range(leave);
  const change = await store.createChange({
    leaveId: leave.id, employeeName: employee.fullName, leaveType: leave.type, oldStart: old.start, oldEnd: old.end,
    newStart: input.newStart, newEnd: input.newEnd, reason: input.reason.trim().slice(0, 500), status: 'pending', requestedAt: input.now.toISOString(),
  });
  const text = `${employee.fullName} asked to move their ${leave.type} leave ${describe(change)}.`;
  await store.notify('hr', 'hr', text);
  await store.notify('admin', 'admin', text);
  return change;
}

/** The employee withdraws their own waiting request. */
export async function cancelChange(store: LeaveChangeStore, input: { email: string; changeId: string }): Promise<void> {
  const employee = await store.employeeByEmail(input.email);
  const change = await store.loadChange(input.changeId);
  if (!employee || !change || !same(change.employeeName, employee.fullName)) throw new ChangeError('Request not found.', 404);
  if (change.status !== 'pending') throw new ChangeError('This request has already been answered.', 409);
  await store.updateChange(change.id, { status: 'cancelled' });
}

/** HR or Admin answers a waiting request. Approving moves the leave; it can be pressed again after a failure. */
export async function decideChange(store: LeaveChangeStore, input: { changeId: string; decision: 'approve' | 'reject'; decidedBy: string; now: Date }): Promise<LeaveDateChange> {
  const change = await store.loadChange(input.changeId);
  if (!change) throw new ChangeError('Request not found.', 404);
  if (change.status !== 'pending') throw new ChangeError(`This request was already ${change.status}.`, 409);
  const decided = { decidedBy: input.decidedBy, decidedAt: input.now.toISOString() };

  if (input.decision === 'reject') {
    await store.updateChange(change.id, { status: 'rejected', ...decided });
    await tell(store, change, `Your request to move your ${change.leaveType} leave ${describe(change)} was not approved. Your leave stays as it was.`);
    return { ...change, status: 'rejected', ...decided };
  }

  const leave = await store.loadLeave(change.leaveId);
  if (!leave) throw new ChangeError('The leave request no longer exists.', 404);
  const now = range(leave);
  // Already moved by an earlier try that failed before the request was marked: just finish.
  if (now.start !== change.newStart || now.end !== change.newEnd) {
    const employee = await store.employeeByName(change.employeeName);
    const why = await problem(store, leave, employee?.id ?? '', change.newStart, change.newEnd, change.reason || 'approved', input.now);
    if (why) throw new ChangeError(why, 409);
    await store.moveLeave(leave.id, formatLeaveDuration(change.newStart, change.newEnd), change.newStart, change.newEnd);
  }
  await store.updateChange(change.id, { status: 'approved', ...decided });
  await tell(store, change, `Your ${change.leaveType} leave now starts on ${formatLeaveDay(change.newStart)} and ends on ${formatLeaveDay(change.newEnd)}, as you asked.`);
  return { ...change, status: 'approved', ...decided };
}

async function tell(store: LeaveChangeStore, change: LeaveDateChange, message: string): Promise<void> {
  const employee = await store.employeeByName(change.employeeName);
  if (employee?.email) await store.notify(employee.email, 'employee', message);
}
