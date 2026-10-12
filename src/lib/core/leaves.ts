// Plain TypeScript — no React, no 'use client', no PocketBase client. Safe to
// import from the browser, Next route handlers and the Edge runtime alike.
// Anything time-dependent takes an injectable `now` so it is unit-testable.
import { getNYDateString } from '../timezone';
import type { LeaveApplication, Profile } from '../hr/types';
import { isWeekday } from './dates';
export { isWeekday };

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
      const dates = parseLeaveDates(l.duration);
      if (!dates) return acc + 1;
      const diff = Math.abs(dates.end.getTime() - dates.start.getTime());
      return acc + Math.ceil(diff / (1000 * 3600 * 24)) + 1;
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
    const dates = parseLeaveDates(l.duration);
    if (!dates) continue;
    const startStr = getNYDateString(dates.start);
    const endStr = getNYDateString(dates.end);
    if (dateStr >= startStr && dateStr <= endStr) return l;
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
    const dates = parseLeaveDates(l.duration);
    // Malformed/unparseable duration string — there's no date range to walk,
    // so there's no way to tell which month (if any) this should count
    // toward. Skip it rather than guessing, which is also what stops a bad
    // record like this from silently charging every month forever the way
    // the old unscoped sum did.
    if (!dates || isNaN(dates.start.getTime()) || isNaN(dates.end.getTime())) continue;
    const endStr = getNYDateString(dates.end);
    for (const cursor = new Date(dates.start); getNYDateString(cursor) <= endStr; cursor.setDate(cursor.getDate() + 1)) {
      if (getNYDateString(cursor).slice(0, 7) === monthKey) total++;
    }
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
    const dates = parseLeaveDates(l.duration);
    if (!dates || isNaN(dates.start.getTime()) || isNaN(dates.end.getTime())) continue;
    if (getNYDateString(dates.start).slice(0, 7) === monthKey || getNYDateString(dates.end).slice(0, 7) === monthKey) count++;
  }
  return count;
}

export function getPTOAccrualDate(profile: Pick<Profile, 'joinedDate' | 'accountCreationDate'>): string {
  return profile.accountCreationDate || profile.joinedDate;
}
