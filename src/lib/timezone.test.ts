// Tests for the NY-timezone date utilities — see this file's own top
// comment for why these exist: the app deliberately renders every
// timestamp in America/New_York regardless of device/region, and these
// helpers are load-bearing for absence/payroll/leave logic across the
// whole app (a timezone bug here passes tsc silently while being
// behaviorally wrong). Plan 015 step 5.
import { describe, it, expect } from 'vitest';
import { getNYDateString, formatDateNY, getNYMidnight, formatShortDateNY, formatTimeNY, formatRelativeDateNY } from './timezone';

describe('getNYDateString', () => {
  it('returns the NY calendar date for a UTC instant that is still the same day in NY', () => {
    // Noon UTC in September (EDT, UTC-4) is 8am in NY — same calendar day.
    expect(getNYDateString(new Date('2026-09-10T12:00:00Z'))).toBe('2026-09-10');
  });

  it('rolls a late-night UTC instant back to the PREVIOUS NY calendar day', () => {
    // 2026-09-10T02:00:00Z is 2026-09-09T22:00:00 in NY (EDT, UTC-4) — the
    // exact scenario this function exists for: an employee clocking in
    // late at night must not get misfiled under the wrong (UTC) day.
    expect(getNYDateString(new Date('2026-09-10T02:00:00Z'))).toBe('2026-09-09');
  });

  it('handles the EST (winter, UTC-5) offset correctly, not just EDT', () => {
    // January is standard time (EST, UTC-5). 4am UTC on Jan 10 is 11pm
    // Jan 9 in NY.
    expect(getNYDateString(new Date('2026-01-10T04:00:00Z'))).toBe('2026-01-09');
  });

  it('defaults to "now" when called with no argument', () => {
    // Just confirms it returns a well-formed YYYY-MM-DD string without
    // throwing — the exact value depends on the real clock.
    expect(getNYDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('formatDateNY', () => {
  it('formats a UTC instant using the NY calendar day, not the UTC day', () => {
    // Same late-night-UTC instant as above — the human-readable format
    // must agree with getNYDateString's calendar-day bucketing.
    expect(formatDateNY(new Date('2026-09-10T02:00:00Z'))).toBe('Sep 9, 2026');
  });

  it('accepts an ISO string directly, not just a Date object', () => {
    expect(formatDateNY('2026-09-10T12:00:00Z')).toBe('Sep 10, 2026');
  });
});

describe('formatShortDateNY', () => {
  it('omits the year and uses the NY calendar day', () => {
    expect(formatShortDateNY(new Date('2026-09-10T02:00:00Z'))).toBe('Sep 9');
  });
});

describe('getNYMidnight', () => {
  it('returns an instant that reads back as exactly midnight in NY during EDT (summer)', () => {
    const midnight = getNYMidnight('2026-09-10');
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
    expect(formatter.format(midnight)).toBe('00:00');
    // Confirm it's actually the 10th in NY, not shifted to the 9th/11th.
    expect(getNYDateString(midnight)).toBe('2026-09-10');
  });

  it('returns an instant that reads back as exactly midnight in NY during EST (winter)', () => {
    // Regression guard for the EDT-vs-EST branch in getNYMidnight's own
    // implementation (it guesses EST first, then corrects to EDT if the
    // guess lands on 1am instead of midnight) — must also work correctly
    // for a date that really IS in EST, where no correction is needed.
    const midnight = getNYMidnight('2026-01-10');
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
    expect(formatter.format(midnight)).toBe('00:00');
    expect(getNYDateString(midnight)).toBe('2026-01-10');
  });

  it('correctly straddles a DST transition boundary date', () => {
    // 2026-03-08 is the Sunday DST begins in the US (2am -> 3am). The
    // calendar day itself still has a well-defined midnight in NY.
    const midnight = getNYMidnight('2026-03-08');
    expect(getNYDateString(midnight)).toBe('2026-03-08');
  });
});

describe('formatRelativeDateNY', () => {
  it('labels a date matching today (NY calendar) as "Today"', () => {
    const now = new Date();
    expect(formatRelativeDateNY(now)).toBe('Today');
  });

  it('labels yesterday (NY calendar) as "Yesterday"', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatRelativeDateNY(yesterday)).toBe('Yesterday');
  });

  it('falls back to a short date for anything further back', () => {
    const result = formatRelativeDateNY(new Date('2020-01-15T12:00:00Z'));
    expect(result).toBe('Jan 15');
  });
});

describe('formatTimeNY', () => {
  it('renders the NY wall-clock time for a UTC instant, not the UTC time', () => {
    // 2026-09-10T13:05:00Z is 9:05 AM in NY (EDT, UTC-4).
    expect(formatTimeNY(new Date('2026-09-10T13:05:00Z'))).toBe('9:05 AM');
  });
});
