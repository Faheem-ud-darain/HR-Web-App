// Plain TypeScript. Changing the dates of a leave request that was already made. The employee asks, HR or Admin decides, and
// the dates update on their own (it used to be done by hand in the database). These are the rules both the request and the
// approval are checked against on the server; the form shows the same messages.
import { addDays, eachDay } from './dates';
import { describeLeaveConflict, findLeaveConflict, getLeaveRange } from './leaves';
import { monthLabel } from './payrollView';
import type { LeaveApplication } from '../hr/types';

export type LeaveDateChangeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** One request to move a leave to other days. */
export interface LeaveDateChange {
  id: string;
  leaveId: string;
  employeeName: string;
  leaveType: LeaveApplication['type'];
  oldStart: string; oldEnd: string;
  newStart: string; newEnd: string;
  reason: string;
  status: LeaveDateChangeStatus;
  requestedAt: string;
  decidedBy?: string; decidedAt?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** "Nov 10, 2026" for "2026-11-10": the same wording the leave form writes into a request's duration. */
export function formatLeaveDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return `${MONTHS[m - 1]} ${String(d).padStart(2, '0')}, ${y}`;
}
/** The duration text stored on a leave: "Nov 10, 2026 - Nov 12, 2026". */
export const formatLeaveDuration = (start: string, end: string): string => `${formatLeaveDay(start)} - ${formatLeaveDay(end)}`;

/** Every "YYYY-MM" month any of these ranges touches. */
export function monthsTouched(...ranges: { start: string; end: string }[]): string[] {
  const months = new Set<string>();
  for (const r of ranges) for (const d of eachDay(r.start, r.end)) months.add(d.slice(0, 7));
  return [...months].sort();
}

const NORMAL_LEAVE_NOTICE_DAYS = 14;

/** Whether to offer "Change dates" on this request at all (the server decides for real): not rejected, and not started yet. */
export function canChangeDates(leave: LeaveApplication, today: string): boolean {
  const range = getLeaveRange(leave);
  return leave.status !== 'rejected' && !!range && range.start >= today;
}

/**
 * Why this change cannot be made, or null when it can. `today` is "YYYY-MM-DD" (New York). `ownLeaves` are all of this person's
 * requests; `lockedMonths` are the "YYYY-MM" months whose pay is already frozen or paid.
 */
export function validateDateChange(input: {
  leave: LeaveApplication; newStart: string; newEnd: string; reason: string; today: string; ownLeaves: LeaveApplication[]; lockedMonths: string[];
}): string | null {
  const { leave, newStart, newEnd, today } = input;
  if (!DAY.test(newStart) || !DAY.test(newEnd)) return 'Please choose both dates.';
  if (newEnd < newStart) return 'The end date cannot be before the start date.';
  if (!input.reason.trim()) return 'Please say why the dates need to change.';
  if (leave.status === 'rejected') return 'A rejected request cannot be changed. Please make a new request.';
  const old = getLeaveRange(leave);
  if (!old) return 'This request has no readable dates, so it cannot be changed here. Please contact HR.';
  if (old.start < today) return 'This leave has already started or finished, so its dates can no longer be changed. Please contact HR.';
  if (newStart < today) return 'The new dates must be today or later.';
  if (leave.type === 'Normal' && newStart < addDays(today, NORMAL_LEAVE_NOTICE_DAYS)) return `Normal leave must be requested at least ${NORMAL_LEAVE_NOTICE_DAYS} days in advance, so the new dates must be ${NORMAL_LEAVE_NOTICE_DAYS} days from today or later.`;
  if (newStart === old.start && newEnd === old.end) return 'These are the same dates as the request already has.';
  const clash = findLeaveConflict(input.ownLeaves.filter(l => l.id !== leave.id), leave.employeeName, newStart, newEnd);
  if (clash) return describeLeaveConflict(clash);
  const locked = monthsTouched(old, { start: newStart, end: newEnd }).filter(m => input.lockedMonths.includes(m));
  if (locked.length > 0) return `The pay for ${locked.map(monthLabel).join(' and ')} is already final, so these dates cannot be changed here. HR can make a correction after payment instead.`;
  return null;
}
