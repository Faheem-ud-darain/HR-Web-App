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
  const anniversarySource = profile.salaryStartDate || profile.joinedDate;
  if (!anniversarySource) return 0;
  const anniversaryDate = new Date(anniversarySource);
  if (isNaN(anniversaryDate.getTime())) return 0;
  const now = new Date();
  if (anniversaryDate > now) return 0;

  const startYear = anniversaryDate.getFullYear();
  let eventsElapsed = now.getFullYear() - startYear;
  const thisYearAnniversary = new Date(now.getFullYear(), anniversaryDate.getMonth(), anniversaryDate.getDate());
  if (thisYearAnniversary > now) eventsElapsed -= 1; // this year's anniversary hasn't happened yet
  if (eventsElapsed < 1) return 0;

  const eventsProcessed = profile.lastIncrementProcessedYear ? Math.max(0, profile.lastIncrementProcessedYear - startYear) : 0;
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
  const anniversarySource = profile.salaryStartDate || profile.joinedDate;
  const perEvent = profile.region === 'USA' ? 100 : 10000;
  if (!anniversarySource) return { originalBaseSalary: profile.baseSalary, events: [] };
  const anniversaryDate = new Date(anniversarySource);
  if (isNaN(anniversaryDate.getTime())) return { originalBaseSalary: profile.baseSalary, events: [] };

  const now = new Date();
  const startYear = anniversaryDate.getFullYear();
  let eventsElapsedToToday = now.getFullYear() - startYear;
  const thisYearAnniversary = new Date(now.getFullYear(), anniversaryDate.getMonth(), anniversaryDate.getDate());
  if (thisYearAnniversary > now) eventsElapsedToToday -= 1;
  if (anniversaryDate > now) eventsElapsedToToday = 0;

  const eventsProcessed = profile.lastIncrementProcessedYear ? Math.max(0, profile.lastIncrementProcessedYear - startYear) : 0;
  const totalEvents = Math.max(eventsElapsedToToday, eventsProcessed);
  const originalBaseSalary = profile.baseSalary - eventsProcessed * perEvent;

  const events: IncrementEvent[] = [];
  for (let n = 1; n <= totalEvents; n++) {
    events.push({ year: startYear + n, amount: perEvent, applied: n <= eventsProcessed });
  }
  return { originalBaseSalary, events };
}
