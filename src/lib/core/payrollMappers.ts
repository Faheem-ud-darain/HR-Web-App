// Plain TypeScript — turns raw PocketBase rows into the shapes payroll works with. Shared by the
// browser (hr/leaves.ts, hr/absences.ts) and the server-side monthly jobs, so both read a row the same way.
import type { LeaveApplication, AbsenceRecord, PayrollRecord, DeductionItem } from '../hr/types';
import type { PbRow } from '../pbTypes';
import { parseLeaveDateStrings } from './leaves';

export function toLeave(l: PbRow): LeaveApplication {
  const stored = l.start_date && l.end_date ? { start: String(l.start_date).slice(0, 10), end: String(l.end_date).slice(0, 10) } : null;
  const range = stored ?? parseLeaveDateStrings(l.duration);
  return {
    id: l.id, employeeName: l.employee_name, type: l.type, duration: l.duration, reason: l.reason, status: l.status,
    startDate: range?.start, endDate: range?.end,
  };
}

export function toAbsenceRecord(r: PbRow): AbsenceRecord {
  return {
    id: r.id, employeeEmail: r.employeeEmail, employeeName: r.employeeName, date: r.date,
    reason: r.reason, inactivityMinutes: r.inactivityMinutes || undefined, workedMinutes: r.workedMinutes || undefined,
    deductionAmount: r.deductionAmount, createdAt: r.createdAt || r.created, acknowledged: !!r.acknowledged,
    deleted: !!r.deleted, deletedAt: r.deletedAt || undefined,
  };
}

/** hr_payroll row (+ the stored breakdown row, if any) -> PayrollRecord. Only a frozen month carries its stored breakdown. */
export function toPayrollRecordFromRow(p: PbRow, extra?: PbRow): PayrollRecord {
  const baseSalary = Number(p.base_salary) || 0;
  const bonus = Number(p.bonus) || 0;
  const deductions = Number(p.deductions) || 0;
  const incrementAmount = Number(p.increment_amount) || 0;
  const processed = !!p.processed;
  // Paid or frozen: the numbers written then are the numbers, and the stored breakdown (if any) says why.
  const useStored = !!extra && (!!extra.frozen || processed);
  // A month paid before breakdowns were stored has no "why" row. The part-month pay added to it is
  // still recoverable: net_pay was saved as base + bonus - deductions + increment + earlier pay.
  const net = Number(p.net_pay);
  const impliedEarlier = processed && !useStored && Number.isFinite(net) ? Math.round((net - (baseSalary + bonus - deductions + incrementAmount)) * 100) / 100 : 0;
  const earlierPay = useStored ? Number(extra!.earlierPay) || 0 : impliedEarlier > 0 ? impliedEarlier : 0;
  const stored = useStored && Array.isArray(extra!.deductionBreakdown) ? (extra!.deductionBreakdown as DeductionItem[]) : null;
  return {
    id: p.id, employeeId: p.employee_id, name: p.employee_name, role: p.role, region: p.region,
    baseSalary, unpaidLeaves: Number(p.unpaid_leaves) || 0, bonus,
    deductions, incrementAmount, processed,
    month: typeof p.month === 'string' ? p.month : '',
    reservedThisMonth: useStored ? Number(extra!.reservedThisMonth) || 0 : 0,
    deferredThisMonth: useStored ? Number(extra!.deferredThisMonth) || 0 : undefined,
    earlierPay: earlierPay || undefined,
    earlierPayLabel: useStored && typeof extra!.earlierPayLabel === 'string' ? extra!.earlierPayLabel : undefined,
    deductionBreakdown: stored ?? (processed && deductions > 0 ? [{ label: 'Deductions at the time of payment', amount: deductions }] : []),
    frozen: useStored || processed,
    pendingArrears: 0,
  };
}

/** PayrollRecord -> the hr_payroll columns written for it (one place, so every writer maps it the same way). */
export function toPayrollRowFields(record: PbRow, todayISO: string): PbRow {
  return {
    employee_id: record.employeeId,
    employee_name: record.name,
    role: record.role,
    region: record.region || 'Pakistan',
    base_salary: record.baseSalary,
    unpaid_leaves: record.unpaidLeaves,
    bonus: record.bonus,
    deductions: record.deductions,
    net_pay: record.baseSalary + record.bonus - record.deductions + record.incrementAmount + (Number(record.earlierPay) || 0),
    increment_amount: record.incrementAmount,
    processed: record.processed,
    status: record.processed ? 'paid' : 'pending',
    paid_date: record.processed ? todayISO : '',
    month: record.month || '',
    year: record.month ? (Number(String(record.month).slice(0, 4)) || undefined) : undefined,
  };
}
