import { describe, it, expect } from 'vitest';
import { ticketsNeedingReplies, appendReplyWithRetry } from './ticketSync';

describe('ticketsNeedingReplies', () => {
  it('asks only for new or changed tickets', () => {
    const cache = new Map([['a', { updated: 'u1', replies: [] }], ['b', { updated: 'u1', replies: [] }]]);
    expect(ticketsNeedingReplies([{ id: 'a', updated: 'u1' }, { id: 'b', updated: 'u2' }, { id: 'c', updated: 'u1' }], cache)).toEqual(['b', 'c']);
  });
  it('refetches when updated is missing', () => {
    const cache = new Map([['a', { updated: 'u1', replies: [] }]]);
    expect(ticketsNeedingReplies([{ id: 'a' }], cache)).toEqual(['a']);
  });
});

describe('appendReplyWithRetry', () => {
  const mk = (id: string) => ({ id });
  it('appends to the latest replies, not a stale copy', async () => {
    let stored = [mk('r1'), mk('r2')]; // r2 arrived after the screen loaded
    await appendReplyWithRetry({
      read: async () => ({ updated: 'u', replies: stored }),
      readUpdated: async () => 'u',
      write: async r => { stored = r; },
    }, mk('mine'));
    expect(stored.map(r => r.id)).toEqual(['r1', 'r2', 'mine']);
  });
  it('re-reads when a concurrent write bumped updated', async () => {
    let stored = [mk('r1')];
    let updated = 'u1';
    let reads = 0;
    await appendReplyWithRetry({
      read: async () => { reads++; return { updated, replies: stored }; },
      readUpdated: async () => {
        if (reads === 1) { stored = [...stored, mk('other')]; updated = 'u2'; } // concurrent reply lands
        return updated;
      },
      write: async r => { stored = r; },
    }, mk('mine'));
    expect(stored.map(r => r.id)).toEqual(['r1', 'other', 'mine']);
    expect(reads).toBe(2);
  });
  it('does not add the same reply twice', async () => {
    let writes = 0;
    await appendReplyWithRetry({
      read: async () => ({ updated: 'u', replies: [mk('mine')] }),
      readUpdated: async () => 'u',
      write: async () => { writes++; },
    }, mk('mine'));
    expect(writes).toBe(0);
  });
});
