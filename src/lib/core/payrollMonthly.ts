// Plain TypeScript — rules for the two scheduled monthly payroll jobs (see api/cron/payroll-monthly):
//   1. FREEZE: at midnight New York on the 1st, the finished month's numbers are written down and
//      stop moving, so a late leave or absence record cannot change a salary that is about to be paid.
//   2. INCREMENTS: once that month is frozen, anyone whose work anniversary has just taken effect
//      gets the raise on their base salary automatically. Nobody adds increments by hand.
import { getMissedIncrementEventsForPayrollMonth, type IncrementInput } from '../incrementMath';

export const INCREMENT_PER_EVENT = { USA: 100, Pakistan: 10000 } as const;

const monthIndex = (key: string): number => {
  const [y, m] = key.split('-').map(Number);
  return y * 12 + (m - 1);
};

/** The month the freeze job is responsible for on a given New York date ("YYYY-MM-DD"): last month. */
export function monthToFreeze(nyDate: string): string {
  const [y, m] = nyDate.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export type IncrementDecision =
  | { status: 'apply'; perEvent: number; newBaseSalary: number; processedThroughYear: number; anniversaryMonth: string }
  | { status: 'none' }
  | { status: 'skipped'; reason: string };

/**
 * Whether an employee's raise should be applied now, for pay month `payMonth` ("YYYY-MM", the month
 * we just entered). Exactly the case the owner described: the anniversary fell in the month BEFORE
 * payMonth and no raise for it has been applied. Anything else that is "owed" (an older anniversary
 * that was never applied, or two missed in a row) is left alone — no back-filling — and reported.
 */
export function decideIncrement(profile: IncrementInput, payMonth: string): IncrementDecision {
  const owed = getMissedIncrementEventsForPayrollMonth(profile, payMonth);
  if (owed <= 0) return { status: 'none' };
  const source = profile.salaryStartDate || profile.joinedDate || '';
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(source);
  if (!parts) return { status: 'skipped', reason: 'start date is not a calendar date' };
  const startYear = Number(parts[1]);
  const processed = profile.lastIncrementProcessedYear ? Math.max(0, profile.lastIncrementProcessedYear - startYear) : 0;
  const eventYear = startYear + processed + 1;
  const anniversaryMonth = `${eventYear}-${parts[2]}`;
  if (owed > 1) return { status: 'skipped', reason: `${owed} raises are owed (older ones are never back-filled)` };
  if (monthIndex(anniversaryMonth) !== monthIndex(payMonth) - 1) {
    return { status: 'skipped', reason: `the raise for ${anniversaryMonth} was missed (older ones are never back-filled)` };
  }
  const perEvent = profile.region === 'USA' ? INCREMENT_PER_EVENT.USA : INCREMENT_PER_EVENT.Pakistan;
  return { status: 'apply', perEvent, newBaseSalary: profile.baseSalary + perEvent, processedThroughYear: eventYear, anniversaryMonth };
}
