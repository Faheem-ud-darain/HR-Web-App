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

/** Long enough to be worth cutting short with a "Read more". */
export function isLongText(text: string, maxChars = PREVIEW_CHARS, maxLines = 3): boolean {
  return text.length > maxChars || text.split('\n').length > maxLines;
}

export const PREVIEW_CHARS = 160;

/** The start of a long text for a card: at most `maxChars` and `maxLines`, cut at a word and ended with "…". A short text comes back whole. */
export function previewText(text: string, maxChars = PREVIEW_CHARS, maxLines = 3): string {
  if (!isLongText(text, maxChars, maxLines)) return text;
  const cut = text.split('\n').slice(0, maxLines).join('\n').slice(0, maxChars);
  const atWord = cut.length === text.length || /\s/.test(text[cut.length] ?? '') ? cut : cut.replace(/\s+\S*$/, '');
  return `${(atWord || cut).trimEnd()}…`;
}
