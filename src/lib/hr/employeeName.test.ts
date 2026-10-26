import { describe, it, expect } from 'vitest';
import { sameEmployeeName, normalizeEmployeeName } from './employeeName';

describe('sameEmployeeName', () => {
  it('ignores case and surrounding / repeated whitespace', () => {
    expect(sameEmployeeName('Ali  Khan ', ' ali khan')).toBe(true);
    expect(sameEmployeeName('ALI KHAN', 'Ali Khan')).toBe(true);
  });
  it('still tells different people apart and never matches empty names', () => {
    expect(sameEmployeeName('Ali Khan', 'Ali Khanum')).toBe(false);
    expect(sameEmployeeName('', '')).toBe(false);
    expect(sameEmployeeName(undefined, null)).toBe(false);
  });
  it('normalizes', () => expect(normalizeEmployeeName('  A  B ')).toBe('a b'));
});
