// Plain TypeScript — turns the payroll engine's numbers into FACTS with dates, for the assistant to put into
// words ("why was X paid less", "who has reserved salary"). It only reads: the amounts come from the same
// engine the Payroll screen uses, so the two can never disagree. No names of other people, no bank numbers.
import type { Profile, PayrollRecord, LeaveApplication, TimesheetEntry, AbsenceRecord } from '../hr/types';
import { computePayrollForMonth, getShortShiftDays } from './payroll';
import { groupDeductions, monthLabel, netPay, payrollFlags } from './payrollView';
import { getLeaveRange, eachLeaveDay } from './leaves';
import { isWeekday } from './dates';
import { getNYDateString } from '../timezone';

export function money(amount: number, region?: string): string {
  const n = Math.round((Number(amount) || 0) * 100) / 100;
  const text = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `${region === 'USA' ? 'USD' : 'PKR'} ${text}`;
}

const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const hm = (mins: number) => `${Math.floor(mins / 60)}h ${String(Math.round(mins % 60)).padStart(2, '0')}m`;

export interface PayInputs {
  profiles: Profile[];
  payroll: PayrollRecord[];
  leaves: LeaveApplication[];
  timesheets: TimesheetEntry[];
  absences: AbsenceRecord[];
  now: Date;
}

/** Days (Mon–Fri) in the month charged as approved leave of one type, as short dates. */
function leaveDates(leaves: LeaveApplication[], fullName: string, type: LeaveApplication['type'], month: string): string[] {
  const days = new Set<string>();
  for (const l of leaves) {
    if (l.employeeName !== fullName || l.type !== type || l.status !== 'approved') continue;
    const r = getLeaveRange(l);
    if (!r) continue;
    for (const d of eachLeaveDay(r)) if (d.slice(0, 7) === month && isWeekday(d)) days.add(d);
  }
  return [...days].sort().map(shortDate);
}

const reservedTotal = (p: Profile) => (Number(p.reservedSalaryBalance) || 0) + (Number(p.manualReservedAmount) || 0);

/** Everything worth saying about one employee's pay for one month. */
export function explainPay(profile: Profile, month: string, inp: PayInputs): Record<string, unknown> {
  const rec = computePayrollForMonth(inp.profiles, inp.payroll, inp.leaves, inp.timesheets, inp.absences, inp.now, month)
    .find(r => r.employeeId === profile.id);
  if (!rec) return { month: monthLabel(month), note: 'No payroll row exists for this person in this month (for example before they joined, or after they left).' };

  const region = profile.region;
  const currentMonth = getNYDateString(inp.now).slice(0, 7);
  const status = rec.processed ? 'paid' : month >= currentMonth ? 'not processed yet (the month is still open)' : rec.frozen ? 'final, waiting for Admin to pay' : 'not paid yet';
  const groups = groupDeductions(rec.deductionBreakdown || []);
  const live = !rec.processed && !rec.frozen;

  const absenceDays = [...new Set(inp.absences.filter(a => !a.deleted && a.employeeEmail.toLowerCase() === (profile.email || '').toLowerCase() && a.date.slice(0, 7) === month).map(a => a.date))].sort().map(shortDate);
  const shortShifts = live ? getShortShiftDays(inp.timesheets, inp.absences, inp.leaves, profile, profile.baseSalary, month, inp.now).map(d => `${shortDate(d.date)} (${hm(d.minutes)})`) : [];
  const urgent = leaveDates(inp.leaves, profile.fullName, 'Urgent', month);
  const normal = leaveDates(inp.leaves, profile.fullName, 'Normal', month);

  const flags = payrollFlags(rec, profile).map(f => f.label);
  const net = netPay(rec);
  const out: Record<string, unknown> = {
    month: monthLabel(month), region: region === 'USA' ? 'USA (USD)' : 'Pakistan (PKR)', status,
    base_salary: money(rec.baseSalary, region),
    ...(rec.incrementAmount ? { increment: money(rec.incrementAmount, region) } : {}),
    ...(rec.bonus ? { bonus: money(rec.bonus, region) } : {}),
    ...(rec.earlierPay ? { earlier_part_month_pay_added: money(rec.earlierPay, region), earlier_pay_note: rec.earlierPayLabel || undefined } : {}),
    total_deductions: money(rec.deductions, region),
    net_pay: money(net, region),
    deduction_breakdown: groups.flatMap(g => g.items.map(i => ({ reason: i.label, amount: money(i.amount, region) }))),
    dates: {
      ...(absenceDays.length ? { absent_days: absenceDays } : {}),
      ...(shortShifts.length ? { short_shifts: shortShifts } : {}),
      ...(urgent.length ? { urgent_leave_days: urgent } : {}),
      ...(normal.length ? { normal_leave_days: normal } : {}),
    },
    ...(rec.reservedThisMonth ? { held_back_this_month: money(rec.reservedThisMonth, region), held_back_note: 'Held back, not lost: paid at resignation or termination.' } : {}),
    ...(rec.deferredThisMonth ? { part_month_pay_set_aside: money(rec.deferredThisMonth, region), set_aside_note: 'Paid together with the salary two months after joining.' } : {}),
    reserved_balance_total: money(reservedTotal(profile), region),
    flags,
    ...(rec.pendingArrears > 0 ? { earlier_month_unpaid: true } : {}),
    ...(rec.processed ? { note: 'A paid month is final. Anything found later is recorded as a correction.' } : {}),
    ...(rec.frozen && !rec.processed ? { note: 'This month was written down on the 1st; later changes do not move it.' } : {}),
    ...(!live ? { dates_note: 'Dates shown come from current records; the amounts are the final ones.' } : {}),
  };
  return out;
}

/** Company-wide status of one month: counts, totals per currency, and who needs a look. */
export function payrollOverviewFacts(month: string, inp: PayInputs, aliasOf: (p: Profile) => string): Record<string, unknown> {
  const recs = computePayrollForMonth(inp.profiles, inp.payroll, inp.leaves, inp.timesheets, inp.absences, inp.now, month);
  const byId = new Map(inp.profiles.map(p => [p.id, p]));
  const groups: Record<string, { people: number; paid: number; unpaid: number; to_pay: number; total: number }> = {};
  const flagged: { who: string; why: string[] }[] = [];
  for (const r of recs) {
    const p = byId.get(r.employeeId);
    if (!p) continue;
    const key = p.region === 'USA' ? 'USA (USD)' : 'Pakistan (PKR)';
    const g = (groups[key] ||= { people: 0, paid: 0, unpaid: 0, to_pay: 0, total: 0 });
    const n = netPay(r);
    g.people++; g.total += n;
    if (r.processed) g.paid++; else { g.unpaid++; g.to_pay += n; }
    const f = payrollFlags(r, p).map(x => x.label);
    if (f.length && !r.processed) flagged.push({ who: aliasOf(p), why: f });
  }
  const fmt = (key: string, n: number) => money(n, key.startsWith('USA') ? 'USA' : 'Pakistan');
  return {
    month: monthLabel(month),
    groups: Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, { people: g.people, paid: g.paid, unpaid: g.unpaid, still_to_pay: fmt(k, g.to_pay), total_net: fmt(k, g.total) }])),
    needs_a_look: flagged.slice(0, 20),
  };
}

/** Everyone holding reserved or held-back salary. */
export function reservedFacts(inp: PayInputs, aliasOf: (p: Profile) => string): Record<string, unknown> {
  const people = inp.profiles
    .filter(p => (p.role === 'employee' || p.role === 'team_lead') && reservedTotal(p) > 0)
    .map(p => ({ who: aliasOf(p), reserved: money(reservedTotal(p), p.region), ...(p.manualReservedNote ? { note: String(p.manualReservedNote).slice(0, 120) } : {}), payable: 'at resignation or termination', ...(p.offboarded ? { status: 'offboarded' } : {}) }));
  return { count: people.length, people, rule: 'Reserved salary is held back, not lost: paid at resignation or termination.' };
}
