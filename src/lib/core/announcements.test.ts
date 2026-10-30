import { describe, it, expect } from 'vitest';
import { announcementWhen, isLongText, previewText } from './announcements';

const now = new Date('2026-10-29T12:00:00Z');

describe('announcementWhen', () => {
  it('puts the day first and drops the year when it is this year', () => {
    expect(announcementWhen('3:01 PM Sep 13, 2026', now)).toBe('Sep 13, 3:01 PM');
  });
  it('keeps the year for an earlier year', () => {
    expect(announcementWhen('10:53 AM Dec 30, 2025', now)).toBe('Dec 30, 2025, 10:53 AM');
  });
  it('returns an unexpected format unchanged', () => {
    expect(announcementWhen('yesterday', now)).toBe('yesterday');
    expect(announcementWhen('', now)).toBe('');
  });
});

describe('isLongText', () => {
  it('is false for a short note and true for a long or many-lined one', () => {
    expect(isLongText('Hello everyone')).toBe(false);
    expect(isLongText('x'.repeat(161))).toBe(true);
    expect(isLongText('a\nb\nc\nd')).toBe(true);
    expect(isLongText('a\nb\nc')).toBe(false);
  });
});

describe('previewText', () => {
  it('leaves a short text whole', () => {
    expect(previewText('Hello everyone')).toBe('Hello everyone');
  });
  it('cuts a long text at a word, within the limit, and ends with an ellipsis', () => {
    const out = previewText('word '.repeat(60));
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(161);
    expect(out).not.toMatch(/\sw…$/);
  });
  it('keeps at most three lines', () => {
    expect(previewText('a\nb\nc\nd\ne')).toBe('a\nb\nc…');
  });
});
