// src/lib/hr/leaves.ts
// Leave applications: useLeaves hook, PTO accrual/tenure math, approved-leave
// lookups, and the hrActions Leaves section. Extracted from the former
// hrData.ts monolith (plan 014). See plans/014-split-hrdata-monolith.md.

'use client';
import { useQuery } from '@tanstack/react-query';
import { pb } from '../pocketbase';
import type { LeaveApplication } from './types';
import { pbList, pbCreate, pbUpdate, pbDelete } from './shared';

function toLeave(l: any): LeaveApplication {
  return { id: l.id, employeeName: l.employee_name, type: l.type, duration: l.duration, reason: l.reason, status: l.status };
}

export function useLeaves(options: { enabled?: boolean } = {}) {
  return useQuery({ enabled: options.enabled ?? true, queryKey: ['hr_leaves'], queryFn: async () => (await pbList('hr_leaves', { fields: 'id,employee_name,type,duration,reason,status' })).map(toLeave) });
}

// Pure leave/PTO math lives in ../core/leaves (shared with the server);
// re-exported so existing imports from this module keep working.
export {
  parseLeaveDates,
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
    pbCreate('hr_leaves', { employee_name: leave.employeeName, type: leave.type, duration: leave.duration, reason: leave.reason, status: leave.status || 'pending' }),
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
