// Presentation rules for the Payroll screen (plan 028) as plain TypeScript, so they are tested and
// the HR and Admin views cannot drift apart. Nothing here changes how pay is calculated — that stays
// in ./payroll.ts. These helpers only decide what the screen SHOWS: one net figure everywhere, the
// deduction reasons in plain groups, and which people need a look before anyone pays them.
import type { PayrollRecord, Profile } from '../hr/types';

/** What the person is paid: base + increment + bonus + earlier part-month pay (new joiners) − deductions, never below zero (deductions can take pay down to nothing, not past it). The ONE definition used by rows, cards, exports and the pay slip. */
export function netPay(r: Pick<PayrollRecord, 'baseSalary' | 'incrementAmount' | 'bonus' | 'deductions'> & { earlierPay?: number }): number {
  return Math.max(0, (Number(r.baseSalary) || 0) + (Number(r.incrementAmount) || 0) + (Number(r.bonus) || 0) + (Number(r.earlierPay) || 0) - (Number(r.deductions) || 0));
}

export type PayrollGroupKey = 'hours' | 'absence' | 'leave' | 'other' | 'held' | 'later';

export interface DeductionGroup {
  key: PayrollGroupKey;
  /** Plain-language heading. */
  label: string;
  total: number;
  /** The individual reasons exactly as the calculation produced them. */
  items: { label: string; amount: number }[];
}

const GROUP_LABELS: Record<PayrollGroupKey, string> = {
  hours: 'Short hours',
  absence: 'Absences',
  leave: 'Leave taken',
  other: 'Other',
  held: 'Held back (first month)',
  later: 'Paid with a later salary',
};
const GROUP_ORDER: PayrollGroupKey[] = ['hours', 'absence', 'leave', 'other', 'later', 'held'];

function groupOf(label: string): PayrollGroupKey {
  if (label.startsWith('Partial Shifts')) return 'hours';
  if (label.startsWith('Absence')) return 'absence';
  if (label.startsWith('Urgent Leave') || label.startsWith('Normal Leave')) return 'leave';
  if (label.startsWith('First-Month Reserve')) return 'held';
  if (label.startsWith('Part-month pay')) return 'later';
  return 'other';
}

/** The itemised deduction reasons, collected into a few plain groups (empty groups are left out). */
/**
 * How much of the listed deduction reasons was NOT taken because deductions can only take pay down to zero (the engine keeps
 * every owed reason in the list but never charges more than the month's pay). Shown as one line under the reasons so a slip adds up:
 * reasons − this = what was actually deducted.
 */
export function deductionLimitedBy(breakdown: { amount: number }[] | undefined, deducted: number): number {
  const owed = (breakdown || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  return Math.max(0, Math.round((owed - (Number(deducted) || 0)) * 100) / 100);
}

export function groupDeductions(breakdown: { label: string; amount: number }[]): DeductionGroup[] {
  const byKey = new Map<PayrollGroupKey, DeductionGroup>();
  for (const item of breakdown || []) {
    const key = groupOf(item.label);
    const g = byKey.get(key) || { key, label: GROUP_LABELS[key], total: 0, items: [] };
    g.total += item.amount;
    g.items.push(item);
    byKey.set(key, g);
  }
  return GROUP_ORDER.filter(k => byKey.has(k)).map(k => byKey.get(k)!);
}

export type PayrollFlagKind = 'no_bank' | 'arrears' | 'zero_net' | 'big_deduction';
export interface PayrollFlag { kind: PayrollFlagKind; label: string; detail: string }

const BIG_DEDUCTION_SHARE = 0.5; // half or more of the month's base salary

/** Does the profile have enough to send money to? A bank name plus an account number or IBAN. */
export function hasBankDetails(profile: Pick<Profile, 'bankName' | 'accountNumber' | 'iban'> | undefined): boolean {
  return !!profile && !!(profile.bankName || '').trim() && !!((profile.accountNumber || '').trim() || (profile.iban || '').trim());
}

/**
 * Reasons this person should be looked at before being paid. Empty = ready. These are warnings, not
 * blocks: someone can still be paid after a look.
 */
export function payrollFlags(record: PayrollRecord, profile: Pick<Profile, 'bankName' | 'accountNumber' | 'iban'> | undefined): PayrollFlag[] {
  const flags: PayrollFlag[] = [];
  if (!hasBankDetails(profile)) flags.push({ kind: 'no_bank', label: 'No bank details', detail: "This employee's profile has no bank name and account number or IBAN, so there is nowhere to send the money." });
  if (record.pendingArrears > 0) flags.push({ kind: 'arrears', label: 'Earlier month unpaid', detail: 'An earlier month for this employee has still not been marked as paid.' });
  // A first-month hold (everything is held back) legitimately pays nothing, so don't call that a problem.
  if (netPay(record) <= 0 && record.reservedThisMonth <= 0 && !(record.deferredThisMonth && record.deferredThisMonth > 0)) flags.push({ kind: 'zero_net', label: 'Pay is zero or less', detail: 'The deductions cancel out the whole salary. Check the reasons before paying.' });
  if (record.baseSalary > 0 && record.reservedThisMonth <= 0 && record.deductions >= record.baseSalary * BIG_DEDUCTION_SHARE && netPay(record) > 0) {
    flags.push({ kind: 'big_deduction', label: 'Large deduction', detail: 'Half or more of the month’s salary is being deducted. Worth a quick check.' });
  }
  return flags;
}

export interface PayrollTotals {
  people: number;
  paid: number;
  unpaid: number;
  needsLook: number;
  /** Net pay still to be sent (unpaid people only). */
  toPay: number;
  /** Net pay of everyone, paid or not. */
  total: number;
}

/** Totals for ONE currency group (callers pass only Pakistan or only USA records — never mix them). */
export function summarizePayroll(records: PayrollRecord[], profiles: Map<string, Pick<Profile, 'bankName' | 'accountNumber' | 'iban'>>): PayrollTotals {
  let paid = 0, needsLook = 0, toPay = 0, total = 0;
  for (const r of records) {
    const n = netPay(r);
    total += n;
    if (r.processed) paid++;
    else {
      toPay += n;
      if (payrollFlags(r, profiles.get(r.employeeId)).length > 0) needsLook++;
    }
  }
  return { people: records.length, paid, unpaid: records.length - paid, needsLook, toPay, total };
}

/** "2026-10" → "October 2026". */
export function monthLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key || '');
  if (!m) return key || '';
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15, 12)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Which month a payroll record is FOR, and when it is paid: salary for September is paid at the
 * start of October. Shown on every payroll screen and pay slip so nobody has to work it out.
 */
export function payPeriod(monthKey: string): { salaryMonth: string; paidMonth: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey || '');
  if (!m) return { salaryMonth: monthKey || '', paidMonth: '' };
  const y = Number(m[1]); const mo = Number(m[2]);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  return { salaryMonth: monthLabel(monthKey), paidMonth: monthLabel(next) };
}

/** The employee's currency group: USA is paid in USD, everyone else in PKR. */
export type PayrollGroup = 'pakistan' | 'usa';
export function groupOfRegion(region: string | undefined): PayrollGroup {
  return region === 'USA' ? 'usa' : 'pakistan';
}
