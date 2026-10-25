import { describe, it, expect } from 'vitest';
import { retentionPhase, retentionCutoffISO, nyDayOfMonth, nyMonthKey, toPbDate, clearedThroughLabel } from './screenshotRetention';

const at = (iso: string) => new Date(iso);

describe('screenshot retention dates', () => {
  it('only deletes from the 10th, and only warns on the 7th–9th (New York days)', () => {
    expect(retentionPhase(at('2026-11-06T16:00:00Z'))).toBe('wait');
    expect(retentionPhase(at('2026-11-07T16:00:00Z'))).toBe('warn');
    expect(retentionPhase(at('2026-11-09T16:00:00Z'))).toBe('warn');
    expect(retentionPhase(at('2026-11-10T16:00:00Z'))).toBe('delete');
    expect(retentionPhase(at('2026-11-11T16:00:00Z'))).toBe('delete'); // catch-up day
    expect(retentionPhase(at('2026-11-28T16:00:00Z'))).toBe('delete'); // rest of the month: only leftovers from before the 1st
  });

  it('counts the day in New York time, not UTC', () => {
    // 03:00 UTC on the 10th is still the evening of the 9th in New York
    expect(nyDayOfMonth(at('2026-11-10T03:00:00Z'))).toBe(9);
    expect(retentionPhase(at('2026-11-10T03:00:00Z'))).toBe('warn');
    expect(retentionPhase(at('2026-11-10T06:00:00Z'))).toBe('delete');
  });

  it('the cutoff is the start of the CURRENT month, so the current month is never touched', () => {
    expect(retentionCutoffISO(at('2026-11-10T09:00:00Z'))).toBe('2026-11-01T00:00:00.000Z');
    expect(retentionCutoffISO(at('2027-01-10T09:00:00Z'))).toBe('2027-01-01T00:00:00.000Z');
    // just after New York midnight on 1 Dec is still 30 Nov evening UTC-wise? no: 05:00Z = midnight NY (EST)
    expect(retentionCutoffISO(at('2026-12-01T06:00:00Z'))).toBe('2026-12-01T00:00:00.000Z');
    expect(nyMonthKey(at('2026-12-01T03:00:00Z'))).toBe('2026-11'); // still 30 Nov evening in New York
    expect(retentionCutoffISO(at('2026-12-01T03:00:00Z'))).toBe('2026-11-01T00:00:00.000Z');
  });

  it('formats dates the way PocketBase stores them and labels the cleared months', () => {
    expect(toPbDate('2026-11-01T00:00:00.000Z')).toBe('2026-11-01 00:00:00.000');
    expect(clearedThroughLabel(at('2026-11-10T09:00:00Z'))).toBe('October 2026 and earlier');
    expect(clearedThroughLabel(at('2027-01-10T09:00:00Z'))).toBe('December 2026 and earlier');
  });
});
