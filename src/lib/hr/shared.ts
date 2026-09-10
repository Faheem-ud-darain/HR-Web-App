// src/lib/hr/shared.ts
// Generic, genuinely cross-domain helpers used by 3+ domain modules:
// low-level PocketBase primitives, date/currency formatting, and the
// generic KV-prefix/query-invalidation hooks. Extracted from the former
// hrData.ts monolith (plan 014). See plans/014-split-hrdata-monolith.md.

'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { pb } from '../pocketbase';
import { getNYDateString } from '../timezone';

const WORKING_DAYS_PER_MONTH = 22; // legacy fallback only — see getWeekdaysInMonth below, the real divisor everywhere daily-rate math runs now

// Per confirmed business rule (2026-09-03): daily rate = base salary /
// COUNT OF WEEKDAYS (Mon-Fri) in the given calendar month — never the
// fixed WORKING_DAYS_PER_MONTH=22 constant above, and never calendar days
// (28-31). monthKey is "YYYY-MM". Falls back to 22 for a malformed key
// rather than risk a divide-by-zero.
export function getWeekdaysInMonth(monthKey: string): number {
  const [year, month] = (monthKey || '').split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return WORKING_DAYS_PER_MONTH;
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay(); // 0=Sun..6=Sat, local calendar (matches the Y/M/D components directly, no UTC drift)
    if (dow !== 0 && dow !== 6) count++;
  }
  return count || WORKING_DAYS_PER_MONTH;
}

// ---------------------------------------------------------------------------
// Low-level PocketBase primitives
// ---------------------------------------------------------------------------

// BUGFIX 2026-09-08: the PocketBase client (src/lib/pocketbase.ts) has no
// request timeout configured at all, and several call sites (notably the
// Start Shift ping/pong handshake below) await a single PocketBase call
// inside a tight polling loop that assumes each attempt takes ~0ms beyond
// its own intended delay. On a stalled/flaky connection a bare `fetch` can
// hang far longer than that — with nothing to cut it off, the awaiting
// code (and any UI state gated on it, e.g. a disabled "Connecting..."
// button) can be stuck for minutes. This wraps any promise with a hard
// deadline so a single slow request can never hang the caller indefinitely.
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'request'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export function looksLikeRealId(id: any): boolean {
  return typeof id === 'string' && /^[a-z0-9]{15}$/.test(id);
}

export async function pbList(collection: string, opts: { sort?: string; filter?: string } = {}): Promise<any[]> {
  try {
    return await pb.collection(collection).getFullList({ requestKey: null, ...opts });
  } catch (err) {
    console.error(`[hrData] getFullList error in ${collection}:`, err);
    return [];
  }
}

// Looks up all rows in `collection` whose `field` matches `email`,
// case-insensitively — a case-insensitive `~` filter narrows server-side,
// then an exact (still case-insensitive) client-side check drops any
// substring false-match, same pattern used throughout this file (see
// getScreenshots, pbUpsertByField). Exists because a plain `=` filter is
// case-SENSITIVE in PocketBase, so any row written back when an employee's
// email was still stored mixed-case (before fromProfileFields started
// lowercasing it) would silently never match here — that's the exact "some
// employees still see the capital-letter email bug" symptom.
export async function pbListByEmailField(collection: string, field: string, email: string, opts: { extraFilter?: string; sort?: string } = {}): Promise<any[]> {
  if (!email) return [];
  const escaped = email.replace(/"/g, '\\"');
  const wanted = email.toLowerCase();
  const filter = opts.extraFilter ? `${field} ~ "${escaped}" && ${opts.extraFilter}` : `${field} ~ "${escaped}"`;
  const rows = await pbList(collection, { filter, sort: opts.sort });
  return rows.filter((r: any) => (r[field] || '').toLowerCase() === wanted);
}

export async function pbCreate(collection: string, fields: any): Promise<any> {
  return pb.collection(collection).create(fields);
}

export async function pbUpdate(collection: string, id: string, fields: any): Promise<any> {
  return pb.collection(collection).update(id, fields);
}

export async function pbDelete(collection: string, id: string): Promise<void> {
  if (!looksLikeRealId(id)) return;
  await pb.collection(collection).delete(id);
}

// Per-(collection, field, value) cache of the matched row's id — same idea
// as kvIdCache below, applied to the real one-row-per-entity collections
// (hr_tracking_settings, hr_ticket_presence) that replaced the old
// hr_tracking_settings_prod_v1 / hr_ticket_presence_* KV blobs. Lets a
// repeat upsert for the same entity skip the lookup round trip.
const upsertIdCache = new Map<string, string>();

// Generic "find the one row where `field` = `value`, update it; otherwise
// create a new row" — the same shape as pbSetKV's lookup-then-create/update
// pattern, but against a real collection with a unique index on `field`
// instead of the generic hr_delcargo_store KV table. Used for
// hr_tracking_settings (keyed on employeeEmail) and hr_ticket_presence
// (keyed on ticketId).
export async function pbUpsertByField(collection: string, field: string, value: string, data: Record<string, any>): Promise<any> {
  const cacheKey = `${collection}:${field}:${value.toLowerCase()}`;
  const cachedId = upsertIdCache.get(cacheKey);
  if (cachedId) {
    try {
      return await pb.collection(collection).update(cachedId, data);
    } catch {
      upsertIdCache.delete(cacheKey);
    }
  }
  // `~` (case-insensitive "like") narrows server-side; the exact
  // case-insensitive check below guards against a substring false-match
  // (same pattern getScreenshots uses for employee email lookups).
  const escaped = value.replace(/"/g, '\\"');
  try {
    const matches = await pb.collection(collection).getFullList({ filter: `${field} ~ "${escaped}"`, requestKey: null });
    const existing = (matches as any[]).find(r => (r[field] || '').toLowerCase() === value.toLowerCase());
    if (existing) {
      upsertIdCache.set(cacheKey, existing.id);
      return await pb.collection(collection).update(existing.id, data);
    }
  } catch {
    // fall through to create
  }
  const created = await pb.collection(collection).create({ [field]: value, ...data });
  upsertIdCache.set(cacheKey, created.id);
  return created;
}

// Finds one row by an exact field match (used for ticketId lookups, which
// are opaque PocketBase ids with no case-sensitivity concern, unlike
// employeeEmail above).
export async function pbFindByField(collection: string, field: string, value: string): Promise<any | null> {
  try {
    return await pb.collection(collection).getFirstListItem(`${field} = "${value.replace(/"/g, '\\"')}"`, { requestKey: null });
  } catch {
    return null;
  }
}

// hr_delcargo_store (KV) helpers — still real server storage, just not a
// per-entity table. Always fetched fresh; never written to localStorage.
// In-memory (per browser tab, per session — never persisted) cache of
// hr_delcargo_store's key -> record id. A KV row's id never changes once
// created, so once we've seen it (via a read OR a write) we can skip the
// "look up the record id" round trip on every subsequent write/delete of
// the same key — cutting the 2-round-trip pbSetKV/pbDeleteKVByKeys pattern
// down to 1 in the common case. Safe to lose on refresh (just falls back
// to a fresh lookup); safe to be stale (falls back to lookup-then-create
// if an update-by-id 404s because the row was deleted elsewhere).
const kvIdCache = new Map<string, string>();

export async function pbGetKV(key: string): Promise<any | null> {
  try {
    const rec = await pb.collection('hr_delcargo_store').getFirstListItem(`key = "${key}"`, { requestKey: null });
    kvIdCache.set(key, rec.id);
    return rec.value;
  } catch {
    return null;
  }
}

export async function pbSetKV(key: string, value: any): Promise<void> {
  const cachedId = kvIdCache.get(key);
  if (cachedId) {
    try {
      await pb.collection('hr_delcargo_store').update(cachedId, { value });
      return;
    } catch {
      // Cached id is stale (row deleted elsewhere, or never existed) —
      // fall through to the full lookup-then-create/update path below.
      kvIdCache.delete(key);
    }
  }
  try {
    const existing = await pb.collection('hr_delcargo_store').getFirstListItem(`key = "${key}"`, { requestKey: null });
    kvIdCache.set(key, existing.id);
    await pb.collection('hr_delcargo_store').update(existing.id, { value });
  } catch {
    const created = await pb.collection('hr_delcargo_store').create({ key, value });
    kvIdCache.set(key, created.id);
  }
}

export async function pbGetKVByPrefix(prefix: string): Promise<{ key: string; value: any; id: string }[]> {
  try {
    const records = await pb.collection('hr_delcargo_store').getFullList({
      filter: `key ~ "${prefix}"`,
      requestKey: null,
    });
    for (const r of records as any[]) kvIdCache.set(r.key, r.id);
    return records.map((r: any) => ({ key: r.key, value: r.value, id: r.id }));
  } catch (err) {
    console.error(`[hrData] KV prefix fetch error (${prefix}):`, err);
    return [];
  }
}

export async function pbDeleteKVByKeys(keys: string[]): Promise<void> {
  // Parallelized (was a sequential for-loop) — each key's lookup+delete is
  // independent, so there's no reason to wait for one before starting the
  // next. Uses the id cache first to skip the lookup entirely when possible.
  await Promise.all(keys.map(async (key) => {
    const cachedId = kvIdCache.get(key);
    kvIdCache.delete(key);
    if (cachedId) {
      try {
        await pb.collection('hr_delcargo_store').delete(cachedId);
        return;
      } catch {
        // Stale cached id — fall through to a fresh lookup below.
      }
    }
    try {
      const rec = await pb.collection('hr_delcargo_store').getFirstListItem(`key = "${key}"`, { requestKey: null });
      await pb.collection('hr_delcargo_store').delete(rec.id);
    } catch {
      // already gone
    }
  }));
}

export function useKVByPrefix(prefix: string) {
  return useQuery({
    queryKey: ['hr_kv', prefix],
    queryFn: () => pbGetKVByPrefix(prefix),
    // Was 5000ms — far tighter than this data (tracking settings, tracker
    // heartbeats) actually needs, and this hook is used from EVERY
    // employee's own dashboard (not just HR/Admin), each polling the
    // entire company-wide blob every 5s. 30s keeps HR/Admin's "is this
    // tracker connected" view reasonably fresh while cutting steady-state
    // load ~6x; callers that need an immediate update after an action
    // already have a manual refetch() available (see TrackingView's
    // refetchSettings/refetchHeartbeats).
    refetchInterval: 30000,
    // Stop polling entirely while the tab is backgrounded/inactive — no
    // reason to keep hitting PocketBase every 30s for a dashboard nobody
    // is looking at right now. Resumes automatically on refocus.
    refetchIntervalInBackground: false,
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (keys: string[]) => keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }));
}

export const formatMoney = (amount: number, region?: 'USA' | 'Pakistan') =>
  region === 'USA' ? `$${amount.toLocaleString()}` : `PKR ${amount.toLocaleString()}`;

export function formatDurationBetween(startISO: string, endISO: string): string {
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

// happened to be (in America/New_York — see clockIn() below) when the record
// was written — it's a plain "YYYY-MM-DD" string, not a real timestamp, so it
// never re-renders relative to whoever's actually looking at it. Per product
// decision, the whole app displays exactly one timezone (America/New_York)
// regardless of the employee's or viewer's own device/location — no
// per-device or IP-based timezone conversion anywhere (see
// src/lib/timezone.ts) — so any "Date" column shown in the UI should derive
// that date fresh from the real clockIn timestamp via that same fixed
// timezone, rather than trusting the stored field (which is fine on its own,
// this just guards against any old rows written before this was fixed).
// Falls back to the stored `date` if clockIn is ever missing/unparseable.
export function localShiftDate(clockInISO: string | undefined | null, fallbackDate?: string): string {
  if (clockInISO) {
    const d = new Date(clockInISO);
    if (!isNaN(d.getTime())) {
      return getNYDateString(d);
    }
  }
  return fallbackDate || '—';
}


// Fixed, well-known teamId for the permanent HR & Admin channel (see the
// "HR & Admin Line" feature) — one real hr_messages channel shared by
// every hr/admin user, never surfaced to employee/team_lead. Unlike Team
// Chat/DMs there's no hr_teams row backing it; TeamChatView is handed a
// single synthetic { id: HR_ADMIN_LINE_TEAM_ID, name: 'HR & Admin',
// members: [] } team instead — see (dashboard)/admin/hr-admin/page.tsx and
// (dashboard)/hr/hr-admin/page.tsx.
// Lives in shared.ts (not notifications.ts or teams.ts) because both of
// those domain modules reference it (buildNotificationLink here uses the
// 'hr_admin' link kind's id; teams.ts's HR & Admin Line forwarding hrActions
// and hasUnseenHrAdminLineActivity use it directly) and neither should
// depend on the other just for this constant.
export const HR_ADMIN_LINE_TEAM_ID = 'hr_admin_line';
