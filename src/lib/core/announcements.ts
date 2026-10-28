// Small rules for showing announcements.

const MONTH_DAY_YEAR_TIME = /^(\d{1,2}:\d{2}\s?[AP]M)\s+([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})$/i;

/**
 * "3:01 PM Sep 13, 2026" -> "Sep 13, 3:01 PM" (the year only when it is not this year). Anything that is not in that
 * shape is returned as it is, so an unexpected format never hides the time.
 */
export function announcementWhen(timestamp: string, now: Date = new Date()): string {
  const m = MONTH_DAY_YEAR_TIME.exec(timestamp.trim());
  if (!m) return timestamp;
  const [, time, month, day, year] = m;
  return `${month} ${day}${Number(year) === now.getFullYear() ? '' : `, ${year}`}, ${time}`;
}

/** Long enough to be worth cutting to a few lines with a "Read more". */
export function isLongText(text: string, maxChars = 160, maxLines = 3): boolean {
  return text.length > maxChars || text.split('\n').length > maxLines;
}
