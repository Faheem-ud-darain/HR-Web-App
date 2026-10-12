// src/lib/hr/leaves.ts
// Leave applications: useLeaves hook, PTO accrual/tenure math, approved-leave
// lookups, and the hrActions Leaves section. Extracted from the former
// hrData.ts monolith (plan 014). See plans/014-split-hrdata-monolith.md.

'use client';
import { useQuery } from '@tanstack/react-query';
import { pb } from '../pocketbase';
import type { LeaveApplication } from './types';
import { pbList, pbCreate, pbUpdate, pbDelete } from './shared';
import { pbFilter } from '../pbFilter';
import { daysAgoNYDateString } from '../timezone';
import { parseLeaveDateStrings } from '../core/leaves';

// Columns the app reads. start_date / end_date are "YYYY-MM-DD" calendar days
// (older rows get them via the backfillLeaveDates migration; until then they
// are derived from the free-text `duration`).
const LEAVE_FIELDS = 'id,employee_name,type,duration,reason,status,start_date,end_date';

function toLeave(l: any): LeaveApplication {
  const stored = l.start_date && l.end_date ? { start: String(l.start_date).slice(0, 10), end: String(l.end_date).slice(0, 10) } : null;
  const range = stored ?? parseLeaveDateStrings(l.duration);
  return {
    id: l.id, employeeName: l.employee_name, type: l.type, duration: l.duration, reason: l.reason, status: l.status,
    startDate: range?.start, endDate: range?.end,
  };
}

export interface LeaveQuery {
  /**
   * One employee's leaves — ALL of them (their PTO balance needs the full history).
   * Pass `null` while the name isn't known yet: the query waits instead of falling
   * back to the company-wide fetch. Leave `undefined` for the company-wide view.
   */
  employeeName?: string | null;
  /**
   * Company-wide view: leaves that ended within this many days, plus anything
   * still pending / awaiting CEO sign-off regardless of age. Default 365.
   * `0` loads everything.
   */
  windowDays?: number;
}

export const DEFAULT_LEAVE_WINDOW_DAYS = 365;

export async function fetchLeaves(q: LeaveQuery = {}): Promise<LeaveApplication[]> {
  const base = { requestKey: null, batch: 200, fields: LEAVE_FIELDS, sort: '-created' } as const;
  if (q.employeeName) {
    return (await pbList('hr_leaves', { filter: pbFilter('employee_name = {:name}', { name: q.employeeName }), fields: LEAVE_FIELDS })).map(toLeave);
  }
  const days = q.windowDays ?? DEFAULT_LEAVE_WINDOW_DAYS;
  if (days <= 0) return (await pbList('hr_leaves', { fields: LEAVE_FIELDS })).map(toLeave);
  // Rows with an empty end_date are legacy (not yet backfilled) — keep them so
  // nothing silently disappears before the migration has run.
  const filter = pbFilter(
    'status = "pending" || status = "hr_approved" || end_date >= {:cutoff} || end_date = ""',
    { cutoff: daysAgoNYDateString(days) },
  );
  try {
    return (await pb.collection('hr_leaves').getFullList({ ...base, filter })).map(toLeave);
  } catch {
    // The start_date/end_date columns don't exist yet (migration not run) —
    // fall back to the old behaviour rather than breaking every leaves screen.
    return (await pbList('hr_leaves', { fields: LEAVE_FIELDS })).map(toLeave);
  }
}

export function useLeaves(options: LeaveQuery & { enabled?: boolean } = {}) {
  const { enabled = true, employeeName, windowDays } = options;
  return useQuery({
    enabled: enabled && employeeName !== null,
    queryKey: ['hr_leaves', employeeName === undefined ? 'all' : employeeName, windowDays ?? DEFAULT_LEAVE_WINDOW_DAYS],
    queryFn: () => fetchLeaves({ employeeName: employeeName ?? undefined, windowDays }),
  });
}

// Pure leave/PTO math lives in ../core/leaves (shared with the server);
// re-exported so existing imports from this module keep working.
export {
  parseLeaveDates,
  parseLeaveDay,
  parseLeaveDateStrings,
  getLeaveRange,
  eachLeaveDay,
  leaveDayCount,
  calculateTenure,
  calculatePTOAccrued,
  getApprovedLeaveDays,
  PTO_FREEZE_UNTIL,
  getRemainingPTO,
  getAccruedPTOForDisplay,
  getApprovedLeaveOnDate,
  isApprovedLeaveOnDate,
  getApprovedLeaveDaysInMonth,
  countApprovedLeaveRequestsInMonth,
  getPTOAccrualDate,
  isWeekday,
} from '../core/leaves';

export const leaveActions = {
  // ── Leaves ────────────────────────────────────────────────────────────
  addLeave: (leave: Omit<LeaveApplication, 'id'>) =>
    pbCreate('hr_leaves', {
      employee_name: leave.employeeName, type: leave.type, duration: leave.duration, reason: leave.reason, status: leave.status || 'pending',
      // Unknown columns are ignored by PocketBase, so this is safe before the migration adds them.
      start_date: leave.startDate || parseLeaveDateStrings(leave.duration)?.start || '',
      end_date: leave.endDate || parseLeaveDateStrings(leave.duration)?.end || '',
    }),
  updateLeaveStatus: (id: string, status: LeaveApplication['status']) =>
    pbUpdate('hr_leaves', id, { status }),
  // Lets an employee withdraw their OWN leave request, but only while it's
  // still sitting untouched at 'pending' — the instant HR takes any action
  // (moves it to 'hr_approved' en route to CEO sign-off, or straight to
  // 'rejected') or Admin/CEO gives final 'approved', the request becomes
  // part of the official record (an approved Urgent/Sick/PTO leave already
  // factors into payroll deductions and PTO-balance math — see
  // computePayrollView/getRemainingPTO above) and must not be deletable.
  //
  // Re-fetches the record fresh from PocketBase rather than trusting
  // whatever status the caller's already-rendered list has cached, so a
  // request that HR approves in the few seconds between page load and the
  // employee clicking Delete can't slip through a stale client-side check.
  // This is a convenience guard, not a security boundary — like the rest of
  // this app, there's no server-side rule (RLS/hook) enforcing it yet.
  deleteLeave: async (id: string): Promise<{ success: boolean; reason?: string }> => {
    let current: any;
    try {
      current = await pb.collection('hr_leaves').getOne(id, { requestKey: null });
    } catch {
      return { success: false, reason: 'This leave request no longer exists.' };
    }
    if (current.status !== 'pending') {
      return { success: false, reason: 'This leave request has already been processed and can no longer be deleted.' };
    }
    await pbDelete('hr_leaves', id);
    return { success: true };
  },
};
