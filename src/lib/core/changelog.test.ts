import { describe, expect, it } from 'vitest';
import { unseenEntries, type ChangelogEntry } from './changelog';

const entry = (id: string): ChangelogEntry => ({ id, when: 'October 2026', title: id, summary: '', preview: 'stack', details: [] });
const entries = [entry('c'), entry('b'), entry('a')];

describe('unseenEntries', () => {
  it('gives everything to someone who has seen nothing', () => {
    expect(unseenEntries(entries, null).map(e => e.id)).toEqual(['c', 'b', 'a']);
  });
  it('gives only the entries newer than the last one seen', () => {
    expect(unseenEntries(entries, 'b').map(e => e.id)).toEqual(['c']);
  });
  it('gives nothing when the newest was seen', () => {
    expect(unseenEntries(entries, 'c')).toEqual([]);
  });
  it('gives everything when the remembered entry is no longer listed', () => {
    expect(unseenEntries(entries, 'gone')).toHaveLength(3);
  });
});
