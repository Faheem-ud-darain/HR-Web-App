// Plain TypeScript — no React, no 'use client', no PocketBase client. Safe to
// import from the browser, Next route handlers and the Edge runtime alike.
// Anything time-dependent takes an injectable `now` so it is unit-testable.
import { getNYDateString } from '../timezone';
import type { LeaveApplication, Profile } from '../hr/types';
import { isWeekday, eachDay } from './dates';
export { isWeekday };

// ── Leave date ranges ───────────────────────────────────────────────────────
// A leave covers whole CALENDAR days, so its dates are handled as plain
// "YYYY-MM-DD" strings end to end — never as Date instants. The old approach
// parsed "Sep 03, 2026" into a local-midnight Date and then converted it to a
// New York day, which slid a day earlier whenever the code ran in a timezone
// ahead of New York (e.g. a Pakistan browser).
//
// Rows store the range as `start_date` / `end_date` ("YYYY-MM-DD") so it can
// be filtered server-side; older rows only have the free-text `duration`
// ("Sep 03, 2026 - Sep 04, 2026"), which parseLeaveDateStrings reads.

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** True when year-month-day is a real calendar day (rejects 2026-02-31, month 13, day 0). */
function isRealDay(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Parses one day ("Sep 03, 2026", "September 3 2026", "2026-09-03", or an ISO/PocketBase timestamp
 * such as "2026-09-03T00:00:00.000Z" / "2026-09-03 00:00:00.000Z") to "YYYY-MM-DD", or null.
 * The WHOLE text must be a valid date: trailing words, impossible days ("2026-02-31", "Feb 31, 2026")
 * and anything else are rejected rather than guessed at, because the result is stored as the
 * authoritative leave range.
 */
export function parseLeaveDay(text: string): string | null {
  const t = (text || '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(t);
  if (iso) return isRealDay(Number(iso[1]), Number(iso[2]), Number(iso[3])) ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
  const named = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t);
  if (named) {
    const month = MONTHS[named[1].slice(0, 3).toLowerCase()];
    const day = Number(named[2]);
    if (month && isRealDay(Number(named[3]), month, day)) return `${named[3]}-${pad2(month)}-${pad2(day)}`;
  }
  return null;
}

export interface LeaveDateRange { start: string; end: string }

/** Reads a free-text duration ("Sep 03, 2026 - Sep 04, 2026", or a single day) into day strings. */
export function parseLeaveDateStrings(duration: string): LeaveDateRange | null {
  const parts = (duration || '').split(/\s+[-–]\s+/);
  if (parts.length > 2) return null; // more than two endpoints: not a range we can trust
  const start = parseLeaveDay(parts[0]);
  if (!start) return null;
  const end = parts.length > 1 ? parseLeaveDay(parts[1]) : start;
  if (!end) return null;
  return end < start ? { start: end, end: start } : { start, end };
}

/** The leave's day range: stored start/end if present, else parsed from `duration`. */
export function getLeaveRange(l: Pick<LeaveApplication, 'duration'> & Partial<Pick<LeaveApplication, 'startDate' | 'endDate'>>): LeaveDateRange | null {
  if (l.startDate && l.endDate) return { start: l.startDate, end: l.endDate };
  return parseLeaveDateStrings(l.duration);
}

/** Every calendar day in the range, inclusive, as "YYYY-MM-DD". */
export const eachLeaveDay = (range: LeaveDateRange): string[] => eachDay(range.start, range.end);

/** Inclusive number of calendar days (weekends included). */
export function leaveDayCount(range: LeaveDateRange): number {
  return eachDay(range.start, range.end).length;
}

export function parseLeaveDates(duration: string): { start: Date; end: Date } | null {
  try {
    const parts = duration.split(' - ');
    if (parts.length < 2) { const d = new Date(parts[0]); return { start: d, end: d }; }
    return { start: new Date(parts[0]), end: new Date(parts[1]) };
  } catch { return null; }
}

export function calculateTenure(joinedDate: string, today: Date = new Date()): { years: number; totalMonths: number } {
  const start = new Date(joinedDate);
  let years = today.getFullYear() - start.getFullYear();
  let months = today.getMonth() - start.getMonth();
  if (months < 0 || (months === 0 && today.getDate() < start.getDate())) { years--; months += 12; }
  const totalMonths = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  return { years: Math.max(0, years), totalMonths: Math.max(0, totalMonths) };
}

export function calculatePTOAccrued(joinedDate: string, now: Date = new Date()): number {
  const { totalMonths } = calculateTenure(joinedDate, now);
  let totalAccrued = 0;
  for (let m = 0; m < totalMonths; m++) {
    const yearOfService = Math.floor(m / 12) + 1;
    let monthlyRate = 0.83;
    if (yearOfService === 2) monthlyRate = 1.0;
    else if (yearOfService === 3) monthlyRate = 1.17;
    else if (yearOfService === 4) monthlyRate = 1.33;
    else if (yearOfService === 5) monthlyRate = 1.5;
    else if (yearOfService === 6) monthlyRate = 1.67;
    else if (yearOfService === 7) monthlyRate = 1.83;
    else if (yearOfService === 8) monthlyRate = 2.08;
    else if (yearOfService === 9) monthlyRate = 2.25;
    else if (yearOfService >= 10) monthlyRate = 2.5;
    totalAccrued += monthlyRate;
  }
  return Math.min(30, Math.round(totalAccrued * 100) / 100);
}

export function getApprovedLeaveDays(leaves: LeaveApplication[], fullName: string, types: Array<'PTO' | 'Sick Leave'>): number {
  return leaves
    .filter(l => l.employeeName === fullName && l.status === 'approved' && (types as string[]).includes(l.type))
    .reduce((acc, l) => {
      const range = getLeaveRange(l);
      return acc + (range ? leaveDayCount(range) : 1);
    }, 0);
}

// Company-wide PTO freeze (explicit request, 2026-09-15): every employee's
// USABLE PTO+Sick bank shows/pays out as 0 until this date, regardless of
// what they've actually accrued — matches the existing "PTO / Sick Leave /
// Parental Leave are all disabled for new requests" block in
// employee/leaves/page.tsx (this is the other half of the same policy: not
// just "can't spend it," but "the bank reads as empty" too). calculatePTOAccrued
// is deliberately untouched — accrual keeps counting in the background so
// nothing is lost once the freeze lifts; only the USABLE remaining balance
// is suppressed. Applied at the source here (not just in the UI) so
// getFinalLeavePayout in payroll.ts — offboarding PTO cashout — is frozen
// the same way, by explicit request, rather than only hiding the number on
// screen while payroll still paid out the real balance underneath.
export const PTO_FREEZE_UNTIL = '2027-01-01';

function isPTOFrozen(now: Date = new Date()): boolean {
  return getNYDateString(now) < PTO_FREEZE_UNTIL;
}

export function getRemainingPTO(leaves: LeaveApplication[], fullName: string, joinedDate: string, now: Date = new Date()): number {
  if (isPTOFrozen(now)) return 0;
  const accrued = calculatePTOAccrued(joinedDate, now);
  const taken = getApprovedLeaveDays(leaves, fullName, ['PTO', 'Sick Leave']);
  return Math.max(0, Math.round((accrued - taken) * 100) / 100);
}

// Display-only variant of calculatePTOAccrued for the two Accrued stat
// tiles (employee dashboard + leaves page): by follow-up request
// (2026-09-15), those should also read 0 while the freeze is on, not just
// the Remaining Bank tile. calculatePTOAccrued itself stays untouched —
// real accrual keeps counting in the background underneath this, so
// nothing is lost once the freeze lifts (see PTO_FREEZE_UNTIL above); this
// wrapper only suppresses what's shown on screen in the meantime.
export function getAccruedPTOForDisplay(joinedDate: string, now: Date = new Date()): number {
  return isPTOFrozen(now) ? 0 : calculatePTOAccrued(joinedDate, now);
}

export function getApprovedLeaveOnDate(leaves: LeaveApplication[], fullName: string, dateStr: string): LeaveApplication | null {
  for (const l of leaves) {
    if (l.employeeName !== fullName || l.status !== 'approved') continue;
    const range = getLeaveRange(l);
    if (!range) continue;
    if (dateStr >= range.start && dateStr <= range.end) return l;
  }
  return null;
}

export function isApprovedLeaveOnDate(leaves: LeaveApplication[], fullName: string, dateStr: string): boolean {
  return getApprovedLeaveOnDate(leaves, fullName, dateStr) !== null;
}

export function getApprovedLeaveDaysInMonth(
  leaves: LeaveApplication[],
  fullName: string,
  type: LeaveApplication['type'],
  monthKey: string
): number {
  let total = 0;
  for (const l of leaves) {
    if (l.employeeName !== fullName || l.type !== type || l.status !== 'approved') continue;
    // Malformed/unparseable duration — there's no date range to walk, so
    // there's no way to tell which month (if any) this should count toward.
    // Skip it rather than guessing, which is also what stops a bad record
    // from silently charging every month forever the way the old unscoped
    // sum did.
    const range = getLeaveRange(l);
    if (!range) continue;
    total += eachLeaveDay(range).filter(d => d.slice(0, 7) === monthKey).length;
  }
  return total;
}

export function countApprovedLeaveRequestsInMonth(
  leaves: LeaveApplication[],
  fullName: string,
  type: LeaveApplication['type'],
  monthKey: string
): number {
  let count = 0;
  for (const l of leaves) {
    if (l.employeeName !== fullName || l.type !== type || l.status !== 'approved') continue;
    const range = getLeaveRange(l);
    if (!range) continue;
    // Counts when the leave's inclusive range touches the month at all — including one that starts
    // before and ends after it (15 Aug – 15 Oct counts for September).
    if (range.start.slice(0, 7) <= monthKey && range.end.slice(0, 7) >= monthKey) count++;
  }
  return count;
}

export function getPTOAccrualDate(profile: Pick<Profile, 'joinedDate' | 'accountCreationDate'>): string {
  return profile.accountCreationDate || profile.joinedDate;
}
