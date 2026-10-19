import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { restorePersistedCache, startPersistingCache, clearPersistedCache, storageKeyFor, PERSISTED_QUERY_KEYS } from './persistedCache';

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

let storage: MemoryStorage;
beforeEach(() => { storage = new MemoryStorage(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

const teams = [{ id: 't1', name: 'Ops' }];

describe('persisted cache', () => {
  it('saves whitelisted queries and restores them for the same user, with their original fetch time', async () => {
    const a = new QueryClient();
    const stop = startPersistingCache(a, () => 'Jane@x.us', storage);
    await a.fetchQuery({ queryKey: ['hr_teams'], queryFn: async () => teams });
    vi.advanceTimersByTime(2000);
    stop();
    expect(storage.getItem(storageKeyFor('jane@x.us'))).toBeTruthy();

    const b = new QueryClient();
    expect(restorePersistedCache(b, 'JANE@x.us', storage)).toBe(1);
    expect(b.getQueryData(['hr_teams'])).toEqual(teams);
    expect(b.getQueryState(['hr_teams'])?.dataUpdatedAt).toBe(a.getQueryState(['hr_teams'])?.dataUpdatedAt);
  });

  it('never stores personal or sensitive queries', async () => {
    const c = new QueryClient();
    const stop = startPersistingCache(c, () => 'jane@x.us', storage);
    for (const key of ['hr_profiles', 'hr_tickets', 'hr_notifications', 'hr_timesheets', 'payroll_me', 'hr_leaves']) {
      await c.fetchQuery({ queryKey: [key], queryFn: async () => [{ secret: 'x' }] });
    }
    await c.fetchQuery({ queryKey: ['hr_warehouses'], queryFn: async () => [{ id: 'w' }] });
    vi.advanceTimersByTime(2000);
    stop();
    const saved = JSON.parse(storage.getItem(storageKeyFor('jane@x.us'))!);
    expect(Object.keys(saved.entries).map(k => JSON.parse(k)[0])).toEqual(['hr_warehouses']);
    expect(PERSISTED_QUERY_KEYS).not.toContain('hr_profiles');
  });

  it('does not show one user\'s cache to another', async () => {
    const a = new QueryClient();
    const stop = startPersistingCache(a, () => 'jane@x.us', storage);
    await a.fetchQuery({ queryKey: ['hr_teams'], queryFn: async () => teams });
    vi.advanceTimersByTime(2000);
    stop();
    expect(restorePersistedCache(new QueryClient(), 'bob@x.us', storage)).toBe(0);
  });

  it('ignores snapshots older than a day and survives corrupt ones', () => {
    storage.setItem(storageKeyFor('jane@x.us'), JSON.stringify({ savedAt: Date.now() - 25 * 3600 * 1000, entries: { '["hr_teams"]': { data: teams, updatedAt: 1 } } }));
    expect(restorePersistedCache(new QueryClient(), 'jane@x.us', storage)).toBe(0);
    storage.setItem(storageKeyFor('bob@x.us'), '{not json');
    expect(restorePersistedCache(new QueryClient(), 'bob@x.us', storage)).toBe(0);
  });

  it('wipes every snapshot on sign-out and leaves other storage alone', () => {
    storage.setItem(storageKeyFor('a@x.us'), '{}');
    storage.setItem(storageKeyFor('b@x.us'), '{}');
    storage.setItem('theme', 'dark');
    clearPersistedCache(storage);
    expect(storage.getItem(storageKeyFor('a@x.us'))).toBeNull();
    expect(storage.getItem(storageKeyFor('b@x.us'))).toBeNull();
    expect(storage.getItem('theme')).toBe('dark');
  });

  it('does nothing without storage or a signed-in user', () => {
    expect(restorePersistedCache(new QueryClient(), null, storage)).toBe(0);
    expect(restorePersistedCache(new QueryClient(), 'a@x.us', null)).toBe(0);
  });
});
