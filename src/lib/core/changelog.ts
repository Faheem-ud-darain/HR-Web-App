// Plain TypeScript. The rules behind "What's New": the entries are written in code (lib/changelogEntries.ts), newest first, and a
// person has seen them up to one entry id.

export type ChangelogPreviewKind = 'stack' | 'dates' | 'readmore';

export interface ChangelogEntry {
  /** Stable and unique; also what "seen up to here" is remembered by. */
  id: string;
  /** "October 2026" */
  when: string;
  title: string;
  /** Two short lines for the card. */
  summary: string;
  /** Which animated mini-preview sits at the top of the card. */
  preview: ChangelogPreviewKind;
  /** The full details, one point each, for "Read more" and the changelog page. */
  details: string[];
}

/** The entries newer than the one the person last saw (all of them when they have seen none, or when that entry is no longer listed). */
export function unseenEntries(entries: ChangelogEntry[], lastSeenId: string | null): ChangelogEntry[] {
  const at = lastSeenId ? entries.findIndex(e => e.id === lastSeenId) : -1;
  return at < 0 ? entries : entries.slice(0, at);
}
