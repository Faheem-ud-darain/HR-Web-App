// Monthly screenshot clean-up rules (run by the Cloudflare cron Worker through
// /api/cron/screenshot-retention). Plain TypeScript so the dates — the part that decides what gets
// DELETED — are tested.
//
// Policy: screenshots are kept for the rest of the month they were taken in, plus until the 10th of
// the NEXT month (so HR/Admin have ten days after month-end to review anything they need). On the
// 10th, everything captured BEFORE the start of the current month is deleted. Employees marked
// "exclude from auto-delete" are never touched.
//   - the warning notice goes out on the 7th (days 7–9 accepted, once per month)
//   - deletion is allowed from the 10th on (never earlier, even if called by mistake)
import { getNYDateString } from '../timezone';

/** Day of the month (1–31) in New York at `now`. */
export function nyDayOfMonth(now: Date): number {
  return parseInt(getNYDateString(now).split('-')[2], 10);
}

/** "YYYY-MM" in New York at `now`. */
export function nyMonthKey(now: Date): string {
  return getNYDateString(now).slice(0, 7);
}

export type RetentionPhase = 'wait' | 'warn' | 'delete';

/** What the job is allowed to do today: nothing (before the 7th), warn (7th–9th), delete (10th onward). */
export function retentionPhase(now: Date): RetentionPhase {
  const day = nyDayOfMonth(now);
  if (day >= 10) return 'delete';
  if (day >= 7) return 'warn';
  return 'wait';
}

/**
 * Screenshots captured BEFORE this instant are due for deletion: 00:00 UTC on the 1st of the current
 * New York month. (New York midnight is 04:00/05:00 UTC, so this errs on the side of keeping a few
 * extra hours of the previous month's last evening — never deleting something from the current month.)
 */
export function retentionCutoffISO(now: Date): string {
  const [y, m] = nyMonthKey(now).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0)).toISOString();
}

/** PocketBase stores dates as "YYYY-MM-DD HH:MM:SS.mmmZ". */
export function toPbDate(iso: string): string {
  return iso.replace('T', ' ').replace('Z', '');
}

/** Human label for the month being cleared, e.g. cutoff 2026-11-01 → "October 2026 and earlier". */
export function clearedThroughLabel(now: Date): string {
  const [y, m] = nyMonthKey(now).split('-').map(Number);
  const prev = new Date(Date.UTC(m === 1 ? y - 1 : y, m === 1 ? 11 : m - 2, 15, 12));
  return `${prev.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })} and earlier`;
}
