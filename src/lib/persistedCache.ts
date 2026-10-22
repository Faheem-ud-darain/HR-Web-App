// Remembers a few NON-SENSITIVE lists across page loads so the app can paint
// them instantly while the real data refreshes in the background.
//
// Only the query keys listed in PERSISTED_QUERY_KEYS are ever stored: company
// teams, warehouses, announcements and maintenance notices. Nothing personal
// (the roster carries salary/bank details; notifications, tickets, tasks,
// timesheets, payroll, leaves are all someone's own data) is written to
// storage, and the cache is keyed by the signed-in email and wiped on sign-out,
// so one person's browser copy is never shown to another.
//
// Restored entries keep their ORIGINAL fetch time, so a query's own staleTime
// still decides whether a refetch is needed: fresh enough -> no request at all,
// older -> the cached data shows immediately and a refetch runs behind it.
import type { QueryClient } from '@tanstack/react-query';

export const PERSISTED_QUERY_KEYS = ['hr_teams', 'hr_warehouses', 'hr_announcements', 'hr_maintenance_notices'] as const;
const STORAGE_PREFIX = 'hr_qcache_v1:';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // anything older than a day is ignored
const SAVE_DEBOUNCE_MS = 1500;

interface Snapshot { savedAt: number; entries: Record<string, { data: unknown; updatedAt: number }> }

export function storageKeyFor(email: string): string {
  return STORAGE_PREFIX + email.trim().toLowerCase();
}

const isPersistable = (queryKey: readonly unknown[]): boolean =>
  typeof queryKey[0] === 'string' && (PERSISTED_QUERY_KEYS as readonly string[]).includes(queryKey[0]);

function safeStorage(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

/** Seeds `queryClient` from this user's saved snapshot (if any). Call before the first render that uses it. */
export function restorePersistedCache(queryClient: QueryClient, email: string | null, storage: Storage | null = safeStorage()): number {
  if (!email || !storage) return 0;
  try {
    const raw = storage.getItem(storageKeyFor(email));
    if (!raw) return 0;
    const snap = JSON.parse(raw) as Snapshot;
    if (!snap || typeof snap.savedAt !== 'number' || Date.now() - snap.savedAt > MAX_AGE_MS) {
      storage.removeItem(storageKeyFor(email));
      return 0;
    }
    let restored = 0;
    for (const [keyJson, entry] of Object.entries(snap.entries || {})) {
      const queryKey = JSON.parse(keyJson) as unknown[];
      if (!isPersistable(queryKey) || !Array.isArray(entry?.data)) continue;
      queryClient.setQueryData(queryKey, entry.data, { updatedAt: entry.updatedAt });
      restored++;
    }
    return restored;
  } catch {
    return 0; // a corrupt snapshot just means a normal cold start
  }
}

/** Saves the whitelisted queries whenever they update. Returns an unsubscribe function. */
export function startPersistingCache(queryClient: QueryClient, getEmail: () => string | null, storage: Storage | null = safeStorage()): () => void {
  if (!storage) return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;

  const save = () => {
    timer = null;
    const email = getEmail();
    if (!email) return;
    try {
      const entries: Snapshot['entries'] = {};
      for (const query of queryClient.getQueryCache().getAll()) {
        if (!isPersistable(query.queryKey) || query.state.status !== 'success' || !Array.isArray(query.state.data)) continue;
        entries[JSON.stringify(query.queryKey)] = { data: query.state.data, updatedAt: query.state.dataUpdatedAt };
      }
      storage.setItem(storageKeyFor(email), JSON.stringify({ savedAt: Date.now(), entries } satisfies Snapshot));
    } catch { /* storage full/blocked — caching is only an optimisation */ }
  };

  const unsubscribe = queryClient.getQueryCache().subscribe(event => {
    if (event.type !== 'updated' || event.action.type !== 'success' || !isPersistable(event.query.queryKey)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, SAVE_DEBOUNCE_MS);
  });
  return () => { unsubscribe(); if (timer) clearTimeout(timer); };
}

/** Wipes every saved snapshot (sign-out). */
export function clearPersistedCache(storage: Storage | null = safeStorage()): void {
  if (!storage) return;
  try {
    const stale: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) stale.push(key);
    }
    stale.forEach(k => storage.removeItem(k));
  } catch { /* ignore */ }
}
