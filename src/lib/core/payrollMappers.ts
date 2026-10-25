// Plain TypeScript — turns raw PocketBase rows into the shapes payroll works with. Shared by the
// browser (hr/leaves.ts, hr/absences.ts) and the server-side monthly jobs, so both read a row the same way.
import type { LeaveApplication, AbsenceRecord, PayrollRecord } from '../hr/types';
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
export function toPayrollRecordFromRow(p: PbRow, extra?: PbRow) {
  return {
    id: p.id, employeeId: p.employee_id, name: p.employee_name, role: p.role, region: p.region,
    baseSalary: Number(p.base_salary) || 0, unpaidLeaves: Number(p.unpaid_leaves) || 0, bonus: Number(p.bonus) || 0,
    deductions: Number(p.deductions) || 0, incrementAmount: Number(p.increment_amount) || 0, processed: !!p.processed,
    month: typeof p.month === 'string' ? p.month : '',
    // The stored "why" for a frozen month (hr_payroll_breakdowns); live months compute it again.
    reservedThisMonth: extra?.frozen ? Number(extra.reservedThisMonth) || 0 : 0,
    deferredThisMonth: extra?.frozen ? Number(extra.deferredThisMonth) || 0 : undefined,
    earlierPay: extra?.frozen ? Number(extra.earlierPay) || 0 : undefined,
    earlierPayLabel: extra?.frozen && typeof extra.earlierPayLabel === 'string' ? extra.earlierPayLabel : undefined,
    deductionBreakdown: extra?.frozen && Array.isArray(extra.deductionBreakdown) ? extra.deductionBreakdown : [],
    frozen: !!extra?.frozen,
    pendingArrears: 0,
  } as PayrollRecord;
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
