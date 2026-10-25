// Corrections to a salary that has ALREADY been marked paid (plan 028).
//
// A paid month is never edited in place — otherwise nobody could tell what was actually sent. Instead
// a correction is recorded on top: the amount that was paid stays as it was, and each correction says
// what the month's pay should have been, the difference, who said so and why. The difference is
// settled separately by Admin (a top-up or a recovery, outside the salary run); it is never added to
// or taken from another month's salary.
export interface PayrollCorrection {
  id: string;
  employeeId: string;
  employeeName: string;
  /** "YYYY-MM": the salary month that was corrected. */
  month: string;
  region: string;
  /** What the month's pay stood at BEFORE this correction (the paid amount, or the previous correction). */
  previousAmount: number;
  /** What the month's pay should be. */
  correctedAmount: number;
  /** correctedAmount − previousAmount. Positive: the employee is owed more. Negative: to recover. */
  difference: number;
  reason: string;
  createdAt: string;
  createdBy: string;
  createdByRole: string;
  settled: boolean;
  settledAt?: string;
  settledBy?: string;
  settlementNote?: string;
}

export const MIN_REASON_LENGTH = 5;
export const MAX_REASON_LENGTH = 500;

export type CorrectionPlan =
  | { ok: false; error: string }
  | { ok: true; previousAmount: number; correctedAmount: number; difference: number; reason: string };

/**
 * Validates a new correction. `paidAmount` is the net the month was paid at; `earlier` are the
 * corrections already recorded for the same employee and month (any order).
 */
export function planCorrection(args: {
  paidAmount: number;
  earlier: Pick<PayrollCorrection, 'correctedAmount' | 'createdAt'>[];
  correctedAmount: unknown;
  reason: unknown;
}): CorrectionPlan {
  const corrected = args.correctedAmount;
  if (typeof corrected !== 'number' || !Number.isFinite(corrected) || corrected < 0) {
    return { ok: false, error: 'Enter the corrected amount as a number, zero or more.' };
  }
  const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
  if (reason.length < MIN_REASON_LENGTH) return { ok: false, error: 'Please give a reason (at least a few words) so everyone can see why it was corrected.' };
  if (reason.length > MAX_REASON_LENGTH) return { ok: false, error: `The reason is too long (limit ${MAX_REASON_LENGTH} characters).` };
  const last = [...args.earlier].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).pop();
  const previousAmount = last ? last.correctedAmount : args.paidAmount;
  const correctedAmount = Math.round(corrected * 100) / 100;
  const difference = Math.round((correctedAmount - previousAmount) * 100) / 100;
  if (difference === 0) return { ok: false, error: 'That is the same amount as before, so there is nothing to correct.' };
  return { ok: true, previousAmount, correctedAmount, difference, reason };
}

/** The corrections for one employee-month, oldest first. */
export function correctionsFor(all: PayrollCorrection[], employeeId: string, month: string): PayrollCorrection[] {
  return all.filter(c => c.employeeId === employeeId && c.month === month).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Corrections whose difference has not been settled yet, per currency group (never mixed). */
export function outstandingTotals(all: PayrollCorrection[]): { pakistan: number; usa: number; count: number } {
  const open = all.filter(c => !c.settled);
  const sum = (usa: boolean) => open.filter(c => (c.region === 'USA') === usa).reduce((s, c) => s + c.difference, 0);
  return { pakistan: sum(false), usa: sum(true), count: open.length };
}

/** The amount the month's pay stands at now: the latest correction, else what was paid. */
export function currentAmount(paidAmount: number, corrections: Pick<PayrollCorrection, 'correctedAmount' | 'createdAt'>[]): number {
  const last = [...corrections].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).pop();
  return last ? last.correctedAmount : paidAmount;
}
