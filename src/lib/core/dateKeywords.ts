import { addDays } from './dates';

const DAY_WORDS: Record<string, number> = { yesterday: -1, today: 0, tomorrow: 1 };

/**
 * What a person typed into a date filter, ready to compare with a "YYYY-MM-DD" date. The words yesterday, today and tomorrow (or the
 * first three letters or more of them) become that day's date; anything else is kept as typed, so a partial date such as "2026-07" still matches.
 * `today` is today's date in New York, like every other date in the app.
 */
export function resolveDateText(text: string, today: string): string {
  const typed = text.trim().toLowerCase();
  if (typed.length < 3) return typed;
  const word = Object.keys(DAY_WORDS).find(w => w.startsWith(typed));
  return word ? addDays(today, DAY_WORDS[word]) : typed;
}
