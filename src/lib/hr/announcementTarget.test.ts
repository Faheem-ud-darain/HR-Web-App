import { describe, it, expect } from 'vitest';
import { encodeAnnouncementTarget, decodeAnnouncementTarget } from './announcementTarget';

describe('announcement target', () => {
  it('keeps simple targets', () => {
    expect(encodeAnnouncementTarget('usa')).toBe('usa');
    expect(decodeAnnouncementTarget('pakistan')).toBe('pakistan');
    expect(decodeAnnouncementTarget('')).toBe('all');
    expect(decodeAnnouncementTarget(undefined)).toBe('all');
  });
  it('round-trips a warehouse list', () => {
    const enc = encodeAnnouncementTarget(['a1', 'b2', 'a1']);
    expect(enc).toBe('wh:a1,b2');
    expect(decodeAnnouncementTarget(enc)).toEqual(['a1', 'b2']);
  });
  it('rejects an empty warehouse list instead of broadcasting', () => {
    expect(() => encodeAnnouncementTarget([])).toThrow();
  });
});
