import { describe, it, expect } from 'vitest';
import { compactName } from './names';

describe('compactName', () => {
  it('keeps a name that fits', () => {
    expect(compactName('Ayesha Khan')).toBe('Ayesha Khan');
    expect(compactName('  Ayesha   Khan ')).toBe('Ayesha Khan');
  });
  it('shortens a long name to the first name and the last name\'s initial', () => {
    expect(compactName('Muhammad Abdul Rahman Siddiqui')).toBe('Muhammad S.');
    expect(compactName('Christopher Alexander')).toBe('Christopher A.');
  });
  it('cuts a single very long word', () => {
    expect(compactName('Abcdefghijklmnopqrstuvwxyz')).toBe('Abcdefghijklmno…');
  });
  it('cuts a first name that is still too long even when shortened', () => {
    expect(compactName('Wolfeschlegelsteinhausen Berger')).toBe('Wolfeschlegelst…');
  });
  it('handles an empty or missing name', () => {
    expect(compactName('')).toBe('');
    expect(compactName(undefined)).toBe('');
  });
});
