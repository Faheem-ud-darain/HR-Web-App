import { describe, it, expect } from 'vitest';
import { isCategoryEnabled, isDirectRecipient, mergeLegacyPrefs } from './notificationPrefs';

describe('isCategoryEnabled', () => {
  it('defaults to on', () => {
    expect(isCategoryEnabled(undefined, 'ticket')).toBe(true);
    expect(isCategoryEnabled({}, 'ticket')).toBe(true);
  });
  it('respects an opt-out', () => {
    expect(isCategoryEnabled({ ticket: false }, 'ticket')).toBe(false);
    expect(isCategoryEnabled({ ticket: false }, 'shift')).toBe(true);
  });
  it('never blocks always-on categories', () => {
    expect(isCategoryEnabled({ maintenance: false, hr_admin_line: false, internal: false }, 'maintenance')).toBe(true);
    expect(isCategoryEnabled({ internal: false }, 'internal')).toBe(true);
    expect(isCategoryEnabled({ ticket: false }, undefined)).toBe(true);
  });
});

describe('recipients and legacy merge', () => {
  it('detects direct recipients', () => {
    expect(isDirectRecipient('a@b.com')).toBe(true);
    expect(isDirectRecipient('all')).toBe(false);
    expect(isDirectRecipient('')).toBe(false);
  });
  it('merges into the legacy map keyed by lowercase email', () => {
    const out = mergeLegacyPrefs({ 'x@y.com': { ticket: true } }, 'A@B.com', { ticket: false });
    expect(out).toEqual({ 'x@y.com': { ticket: true }, 'a@b.com': { ticket: false } });
    expect(mergeLegacyPrefs(null, 'a@b.com', { shift: false })).toEqual({ 'a@b.com': { shift: false } });
  });
});
