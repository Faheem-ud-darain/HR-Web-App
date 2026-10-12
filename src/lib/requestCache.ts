// Tiny in-memory request coalescer for "read the whole map" lookups that many
// components trigger independently on mount (notification / announcement /
// message read-maps, the legacy KV prefix scan). Concurrent callers share one
// in-flight request, and the result is reused for `ttlMs`, so a dashboard that
// asks for the same collection from six places issues one request, not six.
//
// Writers must call invalidateCache() with the same key prefix so the next
// read sees their change immediately. Failed requests are never cached.
type Entry = { at: number; promise: Promise<unknown> };

const store = new Map<string, Entry>();

export function coalesce<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise as Promise<T>;
  const promise = load().catch(err => {
    if (store.get(key)?.promise === promise) store.delete(key);
    throw err;
  });
  store.set(key, { at: Date.now(), promise });
  return promise;
}

export function invalidateCache(prefix: string): void {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}
