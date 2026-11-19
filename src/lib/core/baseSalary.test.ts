import { describe, expect, it } from 'vitest';
import { parseBaseSalary } from './baseSalary';

describe('parseBaseSalary', () => {
  it('accepts a real number, including an explicit 0 and thousands separators', () => {
    expect(parseBaseSalary('85000')).toBe(85000);
    expect(parseBaseSalary(' 85,000 ')).toBe(85000);
    expect(parseBaseSalary('0')).toBe(0);
    expect(parseBaseSalary(1200.5)).toBe(1200.5);
  });
  it('refuses a blank, missing or mistyped value instead of turning it into 0', () => {
    for (const bad of ['', '   ', undefined, null, 'abc', '12abc', '-5', 'NaN', 'Infinity']) expect(parseBaseSalary(bad)).toBeNull();
  });
});
