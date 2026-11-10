import type { InactivityLog } from '../hr/types';

// An idle stretch only counts for the part that sits inside a shift. The tracker can save a stretch that began before a shift started or
// kept running after it ended (for instance while it could not reach the server), so every screen and the absence check cut each log
// down to its overlap with the shifts. One definition, used by both.
type Span = { clockIn: string; clockOut?: string | null };

/** Seconds of this idle stretch that fall inside the given shifts (an open shift runs until `now`). */
export function secondsInsideShifts(log: Pick<InactivityLog, 'startAt' | 'endAt' | 'durationSeconds'>, shifts: Span[], now: number = Date.now()): number {
  const start = Date.parse(log.startAt);
  if (!Number.isFinite(start)) return 0;
  const parsedEnd = Date.parse(log.endAt);
  const end = Number.isFinite(parsedEnd) ? parsedEnd : start + (log.durationSeconds || 0) * 1000;
  let overlap = 0;
  for (const s of shifts) {
    const a = Date.parse(s.clockIn);
    if (!Number.isFinite(a)) continue;
    const b = s.clockOut ? Date.parse(s.clockOut) : now;
    overlap += Math.max(0, Math.min(end, Number.isFinite(b) ? b : now) - Math.max(start, a));
  }
  return Math.round(overlap / 1000);
}

/** The logs with each one cut down to its time inside a shift; a log with none of its time inside a shift is dropped. */
export function clipLogsToShifts<T extends InactivityLog>(logs: T[], shifts: Span[], now: number = Date.now()): T[] {
  return logs.map(l => ({ ...l, durationSeconds: secondsInsideShifts(l, shifts, now) })).filter(l => l.durationSeconds > 0);
}
