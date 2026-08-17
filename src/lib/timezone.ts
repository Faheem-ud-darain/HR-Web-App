// Single source of truth for time display across the whole app. Per explicit
// product decision: the app does NOT follow each device's local timezone or
// any IP-based geolocation — every clock, timestamp, and date shown to any
// user (regardless of which country/region they're physically in) is always
// rendered in America/New_York time. This keeps shift times, attendance
// records, and notification timestamps consistent across a distributed team
// instead of silently shifting per-device.
//
// Use these helpers instead of calling .toLocaleTimeString()/
// .toLocaleDateString()/.toLocaleString() directly anywhere in the app —
// those fall back to the browser/device's local timezone if you don't pass
// an explicit `timeZone`, which is exactly the bug this file exists to
// prevent.
export const APP_TIMEZONE = 'America/New_York';

/** e.g. "9:03 PM" — always in America/New_York, regardless of device. */
export function formatTimeNY(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString('en-US', {
    timeZone: APP_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** e.g. "Aug 3, 2026" — always in America/New_York, regardless of device. */
export function formatDateNY(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', {
    timeZone: APP_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** e.g. "Aug 3" — short date with no year, always America/New_York. */
export function formatShortDateNY(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', {
    timeZone: APP_TIMEZONE,
    month: 'short',
    day: 'numeric',
  });
}

/** e.g. "Aug 3, 2026, 9:03 PM" — always America/New_York. */
export function formatDateTimeNY(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString('en-US', {
    timeZone: APP_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Returns the calendar date (YYYY-MM-DD) for a given instant, as measured in
 * America/New_York — NOT the UTC date and NOT the device's local date.
 * Used for shift/attendance date-bucketing (e.g. "which day does this clock-in
 * belong to"), so an employee clocking in late at night doesn't get their
 * shift misfiled under the wrong day depending on server/device timezone.
 */
export function getNYDateString(date: Date | string | number = new Date()): string {
  const d = date instanceof Date ? date : new Date(date);
  // en-CA locale formats as YYYY-MM-DD, which is exactly the format the rest
  // of the app already stores/compares shift dates as.
  return d.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
}

/**
 * Returns a true Date object representing EXACTLY 00:00:00 America/New_York
 * time for the given calendar day, correctly handling EDT vs EST.
 * @param dateStr "YYYY-MM-DD"
 */
export function getNYMidnight(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00-05:00`); // Guess EST
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: APP_TIMEZONE, hour: 'numeric', hourCycle: 'h23' });
  const hour = parseInt(formatter.format(d), 10);
  // If it formats to hour 1 instead of 0, our UTC-5 guess landed at 1 AM EDT.
  if (hour === 1) return new Date(`${dateStr}T00:00:00-04:00`);
  return d;
}

/** Returns "Today" / "Yesterday" / short date — all judged in America/New_York. */
export function formatRelativeDateNY(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  const dayString = getNYDateString(d);
  const todayString = getNYDateString(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayString = getNYDateString(yesterday);

  if (dayString === todayString) return 'Today';
  if (dayString === yesterdayString) return 'Yesterday';
  return formatShortDateNY(d);
}

// ─────────────────────────────────────────────────────────────────────────
// DELIBERATE EXCEPTION to the America/New_York-only rule above — System
// Maintenance Notices only (see MaintenanceNotice in hrData.ts). Product
// decision: Admin/HR enter the maintenance window as Pakistan wall-clock
// time (since that's the team's own reference point for "when we're
// pushing an update"), but every viewer sees it converted to THEIR OWN
// device's local timezone — the one place in this app where per-viewer
// local time is the explicit point, not the bug the rest of timezone.ts
// exists to prevent. Do not reuse these for anything else; every other
// timestamp in the app should keep going through the NY helpers above.
// ─────────────────────────────────────────────────────────────────────────

/** Pakistan Standard Time is a fixed UTC+5 offset year-round — Pakistan has
 * not observed daylight saving time, so this is a simple, unconditionally
 * correct fixed-offset conversion (unlike most timezones, which would need
 * a real tz database to handle DST transitions). */
export const PKT_UTC_OFFSET_HOURS = 5;

/**
 * Converts a maintenance-window date+time, entered by an Admin/HR user and
 * understood to be Pakistan local time, into a real UTC instant (ISO
 * string) — regardless of what timezone the Admin/HR user's own device
 * happens to be set to. This is why it's built with Date.UTC() rather than
 * `new Date(dateStr + 'T' + timeStr)`, which would silently interpret the
 * input using the browser's OWN local timezone instead of Pakistan's.
 *
 * @param dateStr "YYYY-MM-DD" (e.g. from an <input type="date">)
 * @param timeStr "HH:MM", 24-hour (e.g. from an <input type="time">)
 */
export function pktLocalToUtcIso(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const utcMs = Date.UTC(y, (m || 1) - 1, d || 1, (hh || 0) - PKT_UTC_OFFSET_HOURS, mm || 0);
  return new Date(utcMs).toISOString();
}

/**
 * Displays a UTC instant in the VIEWER'S OWN device/browser local timezone
 * — passing no explicit `timeZone` is intentional here (the opposite of
 * every other formatter in this file), so each person sees the maintenance
 * window at the correct wall-clock moment for wherever they actually are.
 * e.g. "Aug 10, 2026, 5:00 PM" (in whatever timezone the viewing device is
 * set to).
 */
export function formatInViewerLocalTime(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
