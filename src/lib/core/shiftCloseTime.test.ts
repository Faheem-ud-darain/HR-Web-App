import { describe, expect, it } from 'vitest';
import { shiftCloseTime } from './timesheets';

const NOW = Date.parse('2026-11-19T12:00:00Z');

describe('shiftCloseTime (a shift ended by a safety net ends when the person was last seen, not now)', () => {
  it('ends at the last time seen, so a laptop asleep for hours is not paid for them', () => {
    expect(shiftCloseTime('2026-11-19T06:00:00Z', '2026-11-19T08:30:00Z', NOW)).toBe('2026-11-19T08:30:00.000Z');
  });
  it('credits nothing when the last sighting is from before the shift started', () => {
    expect(shiftCloseTime('2026-11-19T06:00:00Z', '2026-11-18T22:00:00Z', NOW)).toBe('2026-11-19T06:00:00.000Z');
  });
  it('credits nothing when the person was never seen', () => {
    expect(shiftCloseTime('2026-11-19T06:00:00Z', null, NOW)).toBe('2026-11-19T06:00:00.000Z');
    expect(shiftCloseTime('2026-11-19T06:00:00Z', 'garbage', NOW)).toBe('2026-11-19T06:00:00.000Z');
  });
  it('never ends in the future (a wrong clock)', () => {
    expect(shiftCloseTime('2026-11-19T06:00:00Z', '2026-11-19T20:00:00Z', NOW)).toBe('2026-11-19T12:00:00.000Z');
  });
  it('reads PocketBase style dates', () => {
    expect(shiftCloseTime('2026-11-19 06:00:00.000Z', '2026-11-19 09:15:30.000Z', NOW)).toBe('2026-11-19T09:15:30.000Z');
  });
});
