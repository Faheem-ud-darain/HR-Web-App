// Plain TypeScript — no React, no 'use client', no PocketBase client. Safe to
// import from the browser, Next route handlers and the Edge runtime alike.
// Anything time-dependent takes an injectable `now` so it is unit-testable.
import { getNYDateString } from '../timezone';

const WORKING_DAYS_PER_MONTH = 22; // legacy fallback only — see getWeekdaysInMonth below, the real divisor everywhere daily-rate math runs now

// Per confirmed business rule (2026-09-03): daily rate = base salary /
// COUNT OF WEEKDAYS (Mon-Fri) in the given calendar month — never the
// fixed WORKING_DAYS_PER_MONTH=22 constant above, and never calendar days
// (28-31). monthKey is "YYYY-MM". Falls back to 22 for a malformed key
// rather than risk a divide-by-zero.
export function getWeekdaysInMonth(monthKey: string): number {
  const [year, month] = (monthKey || '').split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return WORKING_DAYS_PER_MONTH;
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay(); // 0=Sun..6=Sat, local calendar (matches the Y/M/D components directly, no UTC drift)
    if (dow !== 0 && dow !== 6) count++;
  }
  return count || WORKING_DAYS_PER_MONTH;
}

// Returns true if `dateStr` (a "YYYY-MM-DD" America/New_York calendar date,
// same shape as getNYDateString/localShiftDate produce) falls on a Monday
// through Friday. Parsed at UTC noon specifically so the weekday read back
// out can't be shifted by a day depending on the runtime's own local
// timezone — noon UTC is always still the same calendar day in
// America/New_York (which is never more than 5 hours behind UTC).
//
// Exported so any UI that renders a per-day Present/Absent style status
// (see AbsenceDetailsView.tsx's AttendanceStatusBadges) can apply the same
// weekend exclusion runAbsenceCheck already enforces for real absence
// deductions below — without this, a stray/partial timesheet row landing
// on a Saturday or Sunday (e.g. an accidental clock-in, or a shift auto-
// closed just after midnight) reads as a missed workday even though the
// company never expects anyone to work that day at all.
export function isWeekday(dateStr: string): boolean {
  const day = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

// happened to be (in America/New_York — see clockIn() below) when the record
// was written — it's a plain "YYYY-MM-DD" string, not a real timestamp, so it
// never re-renders relative to whoever's actually looking at it. Per product
// decision, the whole app displays exactly one timezone (America/New_York)
// regardless of the employee's or viewer's own device/location — no
// per-device or IP-based timezone conversion anywhere (see
// src/lib/timezone.ts) — so any "Date" column shown in the UI should derive
// that date fresh from the real clockIn timestamp via that same fixed
// timezone, rather than trusting the stored field (which is fine on its own,
// this just guards against any old rows written before this was fixed).
// Falls back to the stored `date` if clockIn is ever missing/unparseable.
export function localShiftDate(clockInISO: string | undefined | null, fallbackDate?: string): string {
  if (clockInISO) {
    const d = new Date(clockInISO);
    if (!isNaN(d.getTime())) {
      return getNYDateString(d);
    }
  }
  return fallbackDate || '—';
}

const DAY_MS = 24 * 3600 * 1000;
const dayNumber = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / DAY_MS;
const dayString = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** "YYYY-MM-DD" plus `n` calendar days — pure string math, so it is timezone-independent. */
export function addDays(dateStr: string, n: number): string {
  return dayString(dayNumber(dateStr) + n);
}

/** Every calendar day from `start` through `end` inclusive ("YYYY-MM-DD"); empty if end < start. */
export function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  for (let n = dayNumber(start); n <= dayNumber(end); n++) days.push(dayString(n));
  return days;
}
