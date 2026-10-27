import type { InactivityLog, TimesheetEntry } from '../hrData';
import { getNYDateString, getNYMidnight } from '../timezone';

// Pure helpers shared by the Screen Tracking views and dialogs (kept out of the React components so they can be
// tested and imported without circular imports).

export const AGENT_SCRIPT_PATH = '/delcargo_tracker_agent.py';

// YYYY-MM-DD in America/New_York, where shift days are measured: NOT `toISOString().split('T')[0]`, which is the
// UTC date. The day pickers and computeWindow() treat this string as a calendar day; defaulting to the UTC date
// made "Today" point at a day that had not happened yet for anyone in the evening in the US.
export const localDateString = (d: Date = new Date()): string => getNYDateString(d);

export type ViewerRange = '2days' | 'day' | 'week' | 'month';

// The [since, until) window for a range + day selection. 'day' is one calendar day, '2days' is that day and the
// one before it, 'week' / 'month' are rolling 7-day and 1-month windows ending now.
export function computeWindow(range: ViewerRange, day: string): { since: Date; until: Date } {
  if (range === 'day') {
    const since = getNYMidnight(day);
    return { since, until: new Date(since.getTime() + 24 * 60 * 60 * 1000) };
  }
  if (range === '2days') {
    const until = new Date(getNYMidnight(day).getTime() + 24 * 60 * 60 * 1000);
    return { since: new Date(until.getTime() - 2 * 24 * 60 * 60 * 1000), until };
  }
  const now = new Date();
  const since = new Date(now);
  if (range === 'week') since.setDate(now.getDate() - 7);
  else since.setMonth(now.getMonth() - 1);
  return { since, until: now };
}

// Clocked-in time for one employee that overlaps [since, until): the overlap of each timesheet entry, so a shift
// that crosses a boundary (e.g. midnight) only counts the part inside. A still-open shift counts up to "now".
export function getShiftSecondsInRange(timesheets: TimesheetEntry[], email: string, since: Date, until: Date, now: Date = new Date()): number {
  return timesheets
    .filter(t => t.employeeEmail.toLowerCase() === email.toLowerCase())
    .reduce((sum, t) => {
      const start = new Date(t.clockIn);
      const end = t.clockOut ? new Date(t.clockOut) : now;
      const seconds = (Math.min(end.getTime(), until.getTime()) - Math.max(start.getTime(), since.getTime())) / 1000;
      return sum + (seconds > 0 ? seconds : 0);
    }, 0);
}

// "1h 5m" / "42m". Rounds to whole minutes FIRST, then splits into hours and minutes: rounding each part on its
// own could show 3599s as "0h 60m" instead of "1h 0m".
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Inactivity logs grouped by New York calendar day, so Weekly / Monthly views still answer "when". Each group has
// its own subtotal and its entries earliest-first (logs arrive newest-first); the newest day comes first.
export function groupLogsByDay(logs: InactivityLog[]): { day: string; logs: InactivityLog[]; totalSeconds: number }[] {
  const groups: Record<string, InactivityLog[]> = {};
  logs.forEach(log => {
    const key = new Date(log.startAt).toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'short', day: 'numeric' });
    (groups[key] = groups[key] || []).push(log);
  });
  return Object.entries(groups)
    .map(([day, dayLogs]) => ({
      day,
      logs: [...dayLogs].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
      totalSeconds: dayLogs.reduce((s, l) => s + l.durationSeconds, 0),
    }))
    .sort((a, b) => new Date(b.logs[b.logs.length - 1].startAt).getTime() - new Date(a.logs[a.logs.length - 1].startAt).getTime());
}
