// Server-only: the PocketBase side of leave date-change requests (rules and order of steps are in core/leaveDateChangeFlow.ts).
// Requests live in their own admin-only collection, hr_leave_date_changes, that only the route touches. The leave itself is
// only written when a request is approved.
import type { PbRow } from '../pbTypes';
import { pbFilter } from '../pbFilter';
import { adminAddNotification, adminFindByField, adminListAll, adminListPayrollForEmployee, pbAdminFetch } from '../pbAdmin';
import { toLeave } from '../core/payrollMappers';
import type { LeaveChangeStore } from '../core/leaveDateChangeFlow';
import type { LeaveDateChange } from '../core/leaveDateChange';

export const CHANGES = 'hr_leave_date_changes';
const LEAVE_FIELDS = 'id,employee_name,type,duration,reason,status,start_date,end_date';

export const toChange = (r: PbRow): LeaveDateChange => ({
  id: r.id, leaveId: r.leave_id, employeeName: r.employee_name, leaveType: r.leave_type,
  oldStart: r.old_start, oldEnd: r.old_end, newStart: r.new_start, newEnd: r.new_end,
  reason: r.reason || '', status: r.status, requestedAt: r.requested_at || r.created || '',
  decidedBy: r.decided_by || undefined, decidedAt: r.decided_at || undefined,
});

const toRow = (c: Partial<LeaveDateChange>): PbRow => {
  const map: Record<string, string> = { leaveId: 'leave_id', employeeName: 'employee_name', leaveType: 'leave_type', oldStart: 'old_start', oldEnd: 'old_end', newStart: 'new_start', newEnd: 'new_end', reason: 'reason', status: 'status', requestedAt: 'requested_at', decidedBy: 'decided_by', decidedAt: 'decided_at' };
  const row: PbRow = {};
  for (const [k, v] of Object.entries(c)) if (map[k] && v !== undefined) row[map[k]] = v;
  return row;
};

/** Whether the set-up has been run (the collection exists). */
export async function changesConfigured(): Promise<boolean> {
  try { await pbAdminFetch(`/api/collections/${CHANGES}`); return true; } catch { return false; }
}

export function pocketBaseLeaveChangeStore(): LeaveChangeStore {
  const profile = (r: PbRow | null) => (r ? { id: r.id as string, fullName: r.full_name as string, email: r.email as string } : null);
  return {
    async employeeByEmail(email) {
      const list = await pbAdminFetch(`/api/collections/hr_profiles/records?perPage=20&filter=${encodeURIComponent(pbFilter('email ~ {:e}', { e: email.trim() }))}`);
      return profile((list?.items || []).find((p: PbRow) => (p.email || '').toLowerCase() === email.trim().toLowerCase()) ?? null);
    },
    async employeeByName(fullName) {
      const list = await pbAdminFetch(`/api/collections/hr_profiles/records?perPage=20&filter=${encodeURIComponent(pbFilter('full_name ~ {:n}', { n: fullName.trim() }))}`);
      return profile((list?.items || []).find((p: PbRow) => (p.full_name || '').trim().toLowerCase() === fullName.trim().toLowerCase()) ?? null);
    },
    async loadLeave(leaveId) {
      try { return toLeave(await pbAdminFetch(`/api/collections/hr_leaves/records/${leaveId}`)); } catch { return null; }
    },
    async loadOwnLeaves(fullName) {
      const rows = await adminListAll('hr_leaves', `fields=${LEAVE_FIELDS}&filter=${encodeURIComponent(pbFilter('employee_name ~ {:n}', { n: fullName.trim() }))}`);
      return rows.filter(r => (r.employee_name || '').trim().toLowerCase() === fullName.trim().toLowerCase()).map(toLeave);
    },
    async lockedMonths(employeeId, months) {
      // A month is final once its pay is frozen by the monthly job or marked paid.
      const rows = await adminListPayrollForEmployee(employeeId);
      const locked: string[] = [];
      for (const month of months) {
        const row = rows.find(r => r.month === month);
        if (!row) continue;
        if (row.processed) { locked.push(month); continue; }
        const breakdown = await adminFindByField('hr_payroll_breakdowns', 'breakdown_key', `${employeeId}_${month}`);
        if ((breakdown?.data as PbRow | undefined)?.frozen) locked.push(month);
      }
      return locked;
    },
    async pendingFor(leaveId) {
      const list = await pbAdminFetch(`/api/collections/${CHANGES}/records?perPage=1&filter=${encodeURIComponent(pbFilter('leave_id = {:id} && status = "pending"', { id: leaveId }))}`);
      return list?.items?.[0] ? toChange(list.items[0]) : null;
    },
    async loadChange(changeId) {
      try { return toChange(await pbAdminFetch(`/api/collections/${CHANGES}/records/${changeId}`)); } catch { return null; }
    },
    async createChange(change) {
      return toChange(await pbAdminFetch(`/api/collections/${CHANGES}/records`, { method: 'POST', body: JSON.stringify(toRow(change)) }));
    },
    async updateChange(changeId, patch) {
      await pbAdminFetch(`/api/collections/${CHANGES}/records/${changeId}`, { method: 'PATCH', body: JSON.stringify(toRow(patch)) });
    },
    async moveLeave(leaveId, duration, start, end) {
      await pbAdminFetch(`/api/collections/hr_leaves/records/${leaveId}`, { method: 'PATCH', body: JSON.stringify({ duration, start_date: start, end_date: end }) });
    },
    async notify(to, role, message) {
      await adminAddNotification(to === role ? 'all' : to, role, message, 'leave_task', 'Leave dates');
    },
  };
}
