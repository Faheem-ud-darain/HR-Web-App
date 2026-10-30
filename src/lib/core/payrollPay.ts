// Plain TypeScript. The HR/Admin payroll WRITES (mark a month paid, change a bonus, tick off an old month) worked out on the
// server, never taken from the browser: the browser says WHO, WHICH MONTH and WHAT HR typed (a bonus); every figure comes
// from the same engine as everywhere else (core/payroll.ts). Talks to storage only through the PayStore below, so it is tested
// with an in-memory store and run in production with the PocketBase one (lib/server/payrollPayStore.ts).
//
// Paying a month does four things, in this order, and each can be run again without doing anything twice:
//   1. FREEZE: write the month's figures down (unpaid). From here the engine hands back exactly this record, so changing the
//      salary in step 2 cannot change the figures.
//   2. RAISE: add the anniversary raise to the base salary (marker first, see raiseSalary in the store).
//   3. RESERVE: bank a new joiner's held-back first month in their reserve balance (balance and "already banked" list are one write).
//   4. PAID: mark the record paid.
// If anything fails the month stays frozen and unpaid; pressing Pay again picks up where it stopped.
import { getNYDateString } from '../timezone';
import { getMissedIncrementEventsForPayrollMonth } from '../incrementMath';
import type { PayrollRecord, Profile } from '../hr/types';
import { addMonths, computePayrollForMonth } from './payroll';
import type { SelfPayrollInputs } from './payrollSelf';

export interface Raise { newBaseSalary: number; processedThroughYear: number }

export interface PayStore {
  /** The employee and the months whose held-back pay is already in their reserve balance. */
  loadEmployee(employeeId: string): Promise<{ profile: Profile; reservedBankedMonths: string[] } | null>;
  /** That one person's saved payroll rows, leaves, shifts and absences, back to `sinceMonth`. */
  loadInputs(profile: Profile, now: Date, sinceMonth: string): Promise<SelfPayrollInputs>;
  /** Writes the payroll row and its breakdown (frozen when `record.frozen` or `record.processed`). Returns the row's id. */
  saveRecord(record: PayrollRecord): Promise<{ id: string }>;
  raiseSalary(profile: Profile, raise: Raise): Promise<void>;
  bankReserve(profile: Profile, add: number, month: string): Promise<void>;
}

export class PayError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) { super(message); }
}

const perEvent = (region?: string) => (region === 'USA' ? 100 : 10000);

/** What paying this record has to do besides marking it paid. Nothing is planned for a step that has already happened. */
export function planPayment(profile: Profile, record: PayrollRecord, reservedBankedMonths: string[]): { raise: Raise | null; reserve: number } {
  const start = /^(\d{4})/.exec(profile.salaryStartDate || profile.joinedDate || '');
  const events = getMissedIncrementEventsForPayrollMonth(profile, record.month || '');
  const raise = start && record.incrementAmount > 0 && events > 0
    ? { newBaseSalary: profile.baseSalary + events * perEvent(profile.region), processedThroughYear: (profile.lastIncrementProcessedYear || Number(start[1])) + events }
    : null;
  const reserve = record.reservedThisMonth > 0 && !reservedBankedMonths.includes(record.month || '') ? record.reservedThisMonth : 0;
  return { raise, reserve };
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** A late joiner's part-month pay is worked out from the joining month, two months before it is paid. */
const LOOKBACK_MONTHS = 2;

async function monthRecord(store: PayStore, employeeId: string, month: string, now: Date) {
  if (!MONTH.test(month)) throw new PayError('That month is not valid.');
  if (month > getNYDateString(now).slice(0, 7)) throw new PayError('That month has not started yet.');
  const loaded = await store.loadEmployee(employeeId);
  if (!loaded) throw new PayError('Employee not found.', 404);
  const inputs = await store.loadInputs(loaded.profile, now, addMonths(month, -LOOKBACK_MONTHS));
  const [record] = computePayrollForMonth([loaded.profile], inputs.payroll, inputs.leaves, inputs.timesheets, inputs.absences, now, month);
  if (!record) throw new PayError('This person has no pay for that month.', 404);
  return { ...loaded, record };
}

/** Pay one employee's month: freeze, raise, bank the held-back pay, mark paid. Safe to run again after a failure. */
export async function payEmployee(store: PayStore, input: { employeeId: string; month: string; now: Date }): Promise<{ status: 'paid' | 'already_paid'; record: PayrollRecord }> {
  const { profile, reservedBankedMonths, record } = await monthRecord(store, input.employeeId, input.month, input.now);
  if (record.processed) return { status: 'already_paid', record };

  let frozen: PayrollRecord = record;
  if (!record.frozen) {
    const { id } = await store.saveRecord({ ...record, processed: false, frozen: true });
    frozen = { ...record, id, frozen: true };
  }
  const { raise, reserve } = planPayment(profile, frozen, reservedBankedMonths);
  if (raise) await store.raiseSalary(profile, raise);
  if (reserve > 0) await store.bankReserve(profile, reserve, frozen.month!);
  const paid: PayrollRecord = { ...frozen, processed: true, frozen: true };
  await store.saveRecord(paid);
  return { status: 'paid', record: paid };
}

/** An earlier month that was paid but never ticked off: only records that it was paid. Touches nobody's salary or balance. */
export async function recordPaid(store: PayStore, input: { employeeId: string; month: string; now: Date }): Promise<{ status: 'paid' | 'already_paid'; record: PayrollRecord }> {
  const { record } = await monthRecord(store, input.employeeId, input.month, input.now);
  if (record.processed) return { status: 'already_paid', record };
  const paid: PayrollRecord = { ...record, processed: true, frozen: true };
  const { id } = await store.saveRecord(paid);
  return { status: 'paid', record: { ...paid, id } };
}

/** HR's bonus for a month that is not paid yet. A paid month is final: a change goes through a correction. */
export async function setBonus(store: PayStore, input: { employeeId: string; month: string; bonus: number; now: Date }): Promise<{ record: PayrollRecord }> {
  if (!Number.isFinite(input.bonus) || input.bonus < 0 || input.bonus > 1_000_000_000) throw new PayError('The bonus must be a number from 0 up.');
  const { record } = await monthRecord(store, input.employeeId, input.month, input.now);
  if (record.processed) throw new PayError('This month is already paid, so its bonus cannot change. Use a correction instead.', 409);
  const next: PayrollRecord = { ...record, bonus: Math.round(input.bonus * 100) / 100 };
  const { id } = await store.saveRecord(next);
  return { record: { ...next, id } };
}
