// Pure salary-increment math, split out of hrData.ts so it can be imported
// from server-side API routes (src/app/api/payroll/me/route.ts) without
// dragging hrData.ts's client-only imports (React, @tanstack/react-query,
// the browser `pb` PocketBase instance) into the Edge runtime bundle.
// hrData.ts's own getMissedIncrementEvents/getPendingIncrement/
// getIncrementHistory are now thin wrappers around these — same signatures,
// same behavior, just delegating here so there's one implementation, not two
// slowly drifting apart.
//
// Deliberately takes a minimal structural type instead of the full Profile
// interface, so callers server-side (which only fetch the handful of
// fields actually needed, not a whole Profile) don't need to fake up
// dozens of unrelated fields just to satisfy the type checker.
import { getNYDateString } from './timezone';

// A start date is a calendar date ("2025-07-13"). Reading it with `new Date(...)` makes it midnight UTC,
// which is the evening before in New York and shifts the anniversary a day (or a month, on the 1st) for
// anyone using the app in the US. So read its year/month/day exactly as written.
interface Ymd { y: number; m: number; d: number }
function parseYmd(source: string | undefined): Ymd | null {
  if (!source) return null;
  const p = /^(\d{4})-(\d{2})-(\d{2})/.exec(source);
  if (p) return { y: Number(p[1]), m: Number(p[2]), d: Number(p[3]) };
  const dt = new Date(source);
  if (isNaN(dt.getTime())) return null;
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
function todayYmd(): Ymd {
  const [y, m, d] = getNYDateString(new Date()).split('-').map(Number);
  return { y, m, d };
}
const ymdNum = (v: Ymd) => v.y * 10000 + v.m * 100 + v.d;

export interface IncrementInput {
  salaryStartDate?: string;
  joinedDate?: string;
  lastIncrementProcessedYear?: number;
  region?: string;
  baseSalary: number;
}

export interface IncrementEvent {
  /** Calendar year this anniversary event falls in. */
  year: number;
  amount: number;
  applied: boolean;
}

// Event numbering: event #1 falls on the first anniversary (start year + 1),
// event #2 on start year + 2, etc. lastIncrementProcessedYear stores the
// calendar year of the last event actually applied, so "events processed" =
// lastIncrementProcessedYear - startYear (0 if never processed).
export function getMissedIncrementEvents(profile: IncrementInput): number {
  const start = parseYmd(profile.salaryStartDate || profile.joinedDate);
  if (!start) return 0;
  const now = todayYmd();
  if (ymdNum(start) > ymdNum(now)) return 0;

  let eventsElapsed = now.y - start.y;
  if (now.m * 100 + now.d < start.m * 100 + start.d) eventsElapsed -= 1; // this year's anniversary hasn't happened yet
  if (eventsElapsed < 1) return 0;

  const eventsProcessed = profile.lastIncrementProcessedYear ? Math.max(0, profile.lastIncrementProcessedYear - start.y) : 0;
  return Math.max(0, eventsElapsed - eventsProcessed);
}

// Total pending increment amount, including any back-filled/missed years —
// flat per-event amount (region-dependent), non-compounding, multiplied by
// however many anniversary events haven't been processed yet.
export function getPendingIncrement(profile: IncrementInput): number {
  const missedEvents = getMissedIncrementEvents(profile);
  if (missedEvents <= 0) return 0;
  const perEvent = profile.region === 'USA' ? 100 : 10000;
  return missedEvents * perEvent;
}

// Payroll-specific variant (confirmed 2026-09-03): an anniversary increment
// must not affect pay for its OWN calendar month, even though
// getMissedIncrementEvents/getPendingIncrement above already treat it as
// "missed"/"pending" the moment the anniversary date passes (that's still
// correct for the informational "X pending" badges elsewhere — see
// UserProfileModal/employee salary page). For actual payroll it must first
// show up in the NEXT calendar month's record — e.g. an employee who
// joined August 2025 and hits their Aug 2026 anniversary gets the raise
// reflected starting with September's pay (processed/paid Oct 1st), not
// August's (processed/paid Sept 1st), even though by the time August's
// payroll is actually processed (1-3 days into September) the anniversary
// date has already passed by the real calendar.
//
// targetMonthKey is "YYYY-MM" — the calendar month a PayrollRecord belongs
// to (computePayrollView's targetMonthKey), NOT necessarily "now". An
// anniversary event only counts once its own calendar month is strictly
// BEFORE targetMonthKey's month — comparing months, not exact dates, since
// the deferral is granular to a full calendar month either way.
export function getMissedIncrementEventsForPayrollMonth(profile: IncrementInput, targetMonthKey: string): number {
  const start = parseYmd(profile.salaryStartDate || profile.joinedDate);
  if (!start) return 0;

  const [targetYear, targetMonthNum] = (targetMonthKey || '').split('-').map(Number);
  if (!targetYear || !targetMonthNum) return 0;

  let eventsElapsed = targetYear - start.y;
  if (eventsElapsed >= 1) {
    // This year's (i.e. the most recent candidate) anniversary event's own
    // calendar month, as a "YYYY-MM" key — if it isn't strictly before
    // targetMonthKey yet, that event doesn't count for this payroll month.
    const candidateEventYear = start.y + eventsElapsed;
    const candidateEventMonthKey = `${candidateEventYear}-${String(start.m).padStart(2, '0')}`;
    if (candidateEventMonthKey >= targetMonthKey) eventsElapsed -= 1;
  }
  if (eventsElapsed < 1) return 0;

  const eventsProcessed = profile.lastIncrementProcessedYear ? Math.max(0, profile.lastIncrementProcessedYear - start.y) : 0;
  return Math.max(0, eventsElapsed - eventsProcessed);
}

export function getPendingIncrementForPayrollMonth(profile: IncrementInput, targetMonthKey: string): number {
  const missedEvents = getMissedIncrementEventsForPayrollMonth(profile, targetMonthKey);
  if (missedEvents <= 0) return 0;
  const perEvent = profile.region === 'USA' ? 100 : 10000;
  return missedEvents * perEvent;
}

// Reconstructs a year-by-year increment timeline for display purposes
// (e.g. the Salary Ledger's Base Salary breakdown modal). IMPORTANT: the
// system only ever stores a single flat per-event amount and a
// "processed through" year — it does not keep a real historical ledger of
// exactly what was applied and when. So "original starting base salary" and
// each past year's amount are *reconstructed* by working backwards from
// the current base_salary using today's flat rate, which is only accurate
// if the per-event amount and region never changed and base_salary was
// never manually edited outside the increment system in between. Treat
// this as a best-effort breakdown, not an audited ledger.
export function getIncrementHistory(profile: IncrementInput): { originalBaseSalary: number; events: IncrementEvent[] } {
  const perEvent = profile.region === 'USA' ? 100 : 10000;
  const start = parseYmd(profile.salaryStartDate || profile.joinedDate);
  if (!start) return { originalBaseSalary: profile.baseSalary, events: [] };

  const now = todayYmd();
  let eventsElapsedToToday = now.y - start.y;
  if (now.m * 100 + now.d < start.m * 100 + start.d) eventsElapsedToToday -= 1;
  if (ymdNum(start) > ymdNum(now)) eventsElapsedToToday = 0;

  const eventsProcessed = profile.lastIncrementProcessedYear ? Math.max(0, profile.lastIncrementProcessedYear - start.y) : 0;
  const totalEvents = Math.max(eventsElapsedToToday, eventsProcessed);
  const originalBaseSalary = profile.baseSalary - eventsProcessed * perEvent;

  const events: IncrementEvent[] = [];
  for (let n = 1; n <= totalEvents; n++) {
    events.push({ year: start.y + n, amount: perEvent, applied: n <= eventsProcessed });
  }
  return { originalBaseSalary, events };
}
