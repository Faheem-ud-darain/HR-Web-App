import { describe, it, expect } from 'vitest';
import { sameList } from './lists';

describe('sameList', () => {
  it('is true for equal lists and the very same list', () => {
    const a = ['Ana', 'Bo'];
    expect(sameList(a, a)).toBe(true);
    expect(sameList(['Ana', 'Bo'], ['Ana', 'Bo'])).toBe(true);
    expect(sameList([], [])).toBe(true);
  });
  it('is false when length, items or order differ', () => {
    expect(sameList(['Ana'], ['Ana', 'Bo'])).toBe(false);
    expect(sameList(['Ana', 'Bo'], ['Bo', 'Ana'])).toBe(false);
    expect(sameList(['Ana'], ['Cy'])).toBe(false);
  });
});
