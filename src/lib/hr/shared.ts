// src/lib/hr/shared.ts
// Generic, genuinely cross-domain helpers used by 3+ domain modules:
// low-level PocketBase primitives, date/currency formatting, and the
// generic KV-prefix/query-invalidation hooks. Extracted from the former
// hrData.ts monolith (plan 014). See plans/014-split-hrdata-monolith.md.

'use client';
import { useQueryClient } from '@tanstack/react-query';
import { pb } from '../pocketbase';
import { pbFilter } from '../pbFilter';
import { sanitizeForWrite } from '../sanitize';
import { coalesce, invalidateCache } from '../requestCache';
import { getSessionEmail } from '../session';
export { pbFilter };
import { getWeekdaysInMonth, localShiftDate } from '../core/dates';
import type { PbRow, PbJson } from '@/lib/pbTypes';
export { getWeekdaysInMonth, localShiftDate };

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

export function looksLikeRealId(id: string): boolean {
  return typeof id === 'string' && /^[a-z0-9]{15}$/.test(id);
}

// `fields` trims the response to just the columns the caller maps (comma
// separated, e.g. 'id,email,teams') — `id` is NOT implicit, include it when
// the caller needs it. getFullList pages through the collection in
// `batch`-sized requests, so for collections that grow without bound prefer
// a `filter` over fetching everything.
export async function pbList(collection: string, opts: { sort?: string; filter?: string; fields?: string } = {}): Promise<PbRow[]> {
  try {
    return await pb.collection(collection).getFullList({ requestKey: null, batch: 200, ...opts });
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
export async function pbListByEmailField(collection: string, field: string, email: string, opts: { extraFilter?: string; sort?: string } = {}): Promise<PbRow[]> {
  if (!email) return [];
  const wanted = email.toLowerCase();
  // `field` is always a code-supplied column name (never user input), so it's
  // safe to inline; only the email value is bound.
  const base = pbFilter(`${field} ~ {:email}`, { email });
  const filter = opts.extraFilter ? `${base} && ${opts.extraFilter}` : base;
  const rows = await pbList(collection, { filter, sort: opts.sort });
  return rows.filter((r: PbRow) => (r[field] || '').toLowerCase() === wanted);
}

// Every write through these helpers is passed through sanitizeForWrite first
// (control/spoofing characters stripped from all strings, nothing else
// changed) — one chokepoint instead of every form remembering to do it.
export async function pbCreate(collection: string, fields: PbRow): Promise<PbJson> {
  return pb.collection(collection).create(sanitizeForWrite(fields));
}

export async function pbUpdate(collection: string, id: string, fields: PbRow): Promise<PbJson> {
  return pb.collection(collection).update(id, sanitizeForWrite(fields));
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
export async function pbUpsertByField(collection: string, field: string, value: string, rawData: PbRow): Promise<PbJson> {
  const data = sanitizeForWrite(rawData);
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
  try {
    const matches = await pb.collection(collection).getFullList({ filter: pbFilter(`${field} ~ {:value}`, { value }), requestKey: null });
    const existing = (matches as PbRow[]).find(r => (r[field] || '').toLowerCase() === value.toLowerCase());
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
export async function pbFindByField(collection: string, field: string, value: string): Promise<PbJson | null> {
  try {
    return await pb.collection(collection).getFirstListItem(pbFilter(`${field} = {:value}`, { value }), { requestKey: null });
  } catch {
    return null;
  }
}

// Deletes the one row (if any) where `field` = `value` — the delete-side
// counterpart to pbFindByField/pbUpsertByField, used where a state is
// cleared entirely rather than updated (e.g. a ticket's closed-at timer
// clearing on reopen).
export async function pbDeleteByField(collection: string, field: string, value: string): Promise<void> {
  const row = await pbFindByField(collection, field, value);
  if (row) {
    try {
      await pb.collection(collection).delete(row.id, { requestKey: null });
    } catch {
      // already gone — fine
    }
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

export async function pbGetKV(key: string): Promise<PbJson | null> {
  try {
    const rec = await pb.collection('hr_delcargo_store').getFirstListItem(pbFilter('key = {:key}', { key }), { requestKey: null });
    kvIdCache.set(key, rec.id);
    return rec.value;
  } catch {
    return null;
  }
}

export async function pbSetKV(key: string, value: PbJson): Promise<void> {
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
    const existing = await pb.collection('hr_delcargo_store').getFirstListItem(pbFilter('key = {:key}', { key }), { requestKey: null });
    kvIdCache.set(key, existing.id);
    await pb.collection('hr_delcargo_store').update(existing.id, { value });
  } catch {
    const created = await pb.collection('hr_delcargo_store').create({ key, value });
    kvIdCache.set(key, created.id);
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
      const rec = await pb.collection('hr_delcargo_store').getFirstListItem(pbFilter('key = {:key}', { key }), { requestKey: null });
      await pb.collection('hr_delcargo_store').delete(rec.id);
    } catch {
      // already gone
    }
  }));
}

// hr_tracker_signals — one row per employee (plan 027 Phase 4b), consolidating
// the 8 per-employee "5-Signal Tracker Reliability System" hr_delcargo_store
// KV keys (tracker_heartbeat_<email>, shift_stop_signal_<email>,
// tracker_quit_intent_<email>, tracker_ping_<email>, tracker_pong_<email>,
// tracker_stop_cmd_<email>, tracker_command_<email>, tracker_diagnostics_<email>)
// into named json sub-fields (heartbeat, shift_stop_signal, quit_intent, ping,
// pong, stop_cmd, command, diagnostics) on a single row keyed by email.
// tracker-agent/agent_gui.py was updated in lockstep to read/write this same
// collection/fields — see its own _get_tracker_signal_field/
// _set_tracker_signal_field helpers.
//
// Deliberately built on the existing generic pbFindByField/pbUpsertByField/
// pbUpdate helpers above rather than a second copy of their lookup+cache
// logic (an earlier pass here had its own trackerSignalIdCache duplicating
// upsertIdCache almost verbatim — removed; pbUpsertByField's own cache
// already covers the hot path, keyed the same way).

export async function pbGetTrackerSignal(email: string, field: string): Promise<PbJson | null> {
  const key = (email || '').toLowerCase();
  if (!key) return null;
  // The heartbeat / stop-signal / quit-intent checks fire together for one
  // employee; share the one row for a moment instead of three identical reads.
  // Short TTL on purpose: the agent writes pong/command externally and the
  // portal polls them, so this must stay fresher than that poll.
  const row = await coalesce(`tsrow:${key}`, 500, () => pbFindByField('hr_tracker_signals', 'email', key));
  return row ? (row[field] ?? null) : null;
}

// Returns { email, value } for every employee that currently has a non-null
// value in `field` — used by getAllTrackerHeartbeats (dashboard-wide sweep),
// the one caller that needs everyone's signal at once instead of a single
// employee's. No single-row helper covers this (it's a full-collection
// scan), so it stays its own function rather than delegating.
export async function pbGetAllTrackerSignals(field: string): Promise<{ email: string; value: PbJson }[]> {
  // Only this one signal column (plus the key) is needed, not all 8 json blobs.
  // Coalesced: the dashboard sweeps, the Tracking page poll and any other
  // caller asking within a few seconds share one request.
  return coalesce(`tsig:${field}`, 3000, async () => {
    const rows = await pbList('hr_tracker_signals', { fields: `email,${field}` });
    return rows
      .filter(r => r[field] != null)
      .map(r => ({ email: r.email, value: r[field] }));
  });
}

export async function pbSetTrackerSignal(email: string, field: string, value: PbJson): Promise<void> {
  const key = (email || '').toLowerCase();
  if (!key) return;
  await pbUpsertByField('hr_tracker_signals', 'email', key, { [field]: value });
  invalidateCache('tsig:');
  invalidateCache('tsrow:');
}

export async function pbClearTrackerSignal(email: string, field: string): Promise<void> {
  await pbSetTrackerSignal(email, field, null);
}

// Clears several fields on the same employee's row in one write (used by
// forceDisconnectAllTrackers, which used to fire off several separate
// hr_delcargo_store deletes). Deliberately does NOT delegate to
// pbUpsertByField (which creates a row on a miss) — clearing signals for an
// employee with no hr_tracker_signals row at all should stay a no-op, not
// create an empty placeholder row.
export async function pbClearTrackerSignalFields(email: string, fields: string[]): Promise<void> {
  const key = (email || '').toLowerCase();
  if (!key) return;
  const row = await pbFindByField('hr_tracker_signals', 'email', key);
  if (!row) return;
  const patch: Record<string, null> = {};
  fields.forEach(f => { patch[f] = null; });
  await pbUpdate('hr_tracker_signals', row.id, patch);
  invalidateCache('tsig:');
  invalidateCache('tsrow:');
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (keys: string[]) => keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }));
}

// ── Plan 027 Phase 3: "read receipt" collection helpers ─────────────────
// One row per (entityId, email) pair, replacing a single shared row that
// held a `{ entityId: [readerEmail, ...] }` map for the WHOLE company —
// notification/announcement/message/maintenance-notice read & cleared
// state all used that shape. The problem it had: marking one entity read
// meant fetch-the-whole-map, mutate one entry, write-the-whole-map-back,
// so two people marking different entities read at the same moment could
// silently overwrite each other's change (a real race, not hypothetical —
// see plan 027's Problem section). A read receipt is naturally a
// create-once, append-only fact ("this person has seen this thing"), so
// there's nothing to update-and-possibly-race on: creating a row either
// succeeds (first time) or fails on the unique index (already read) —
// either way the caller's "it's read now" postcondition holds.
//
// Read side keeps the exact same `Record<entityId, string[]>` shape every
// existing `isXRead(entity, email, map)` call site already expects, so
// nothing above this layer needs to change — only how the map gets built.
// hr_notification_reads / hr_notification_cleared / hr_announcement_reads /
// hr_message_reads / hr_notification_prefs pre-existed (from earlier,
// unrecorded prep work — same root cause as hr_user_sessions/
// hr_profile_docs elsewhere in this plan) with a DIFFERENT shape than the
// read-receipt one above: ONE ROW PER EMAIL, holding an array of the ids
// that person has read/cleared (e.g. { email, read_ids: [...] }), rather
// than one row per (entity, email) pair. This is actually already
// race-safe ACROSS users (each person only ever writes their own row), so
// it doesn't need the read-receipt treatment — it only needs a
// read-modify-write that's batched per call so marking several ids read
// in one screen render doesn't race against itself.
// The same map is requested by Sidebar, TopNav, popups and dashboards on every
// page mount — coalesced so concurrent/near-simultaneous callers share one
// request. Callers get their own copy so mutating the result is safe.
const READ_MAP_TTL_MS = 5000;

const cloneMap = (m: Record<string, string[]>): Record<string, string[]> =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v]]));

// Read-state rows (one per person) are fetched with an explicit SCOPE, so a
// screen only downloads the rows it actually uses:
//   'own'            — just the signed-in person's row (the default, and all the
//                      notification bell / nav dots / popups ever need — for
//                      everyone, HR and Admin included);
//   { emails: [...] }— just those people (e.g. chat read-receipts for the
//                      members of the one channel that is open);
//   'all'            — every row, only for screens that genuinely show
//                      everyone's reads (the announcements "Viewed by" list).
export type ReadScope = 'own' | 'all' | { emails: string[] };

function resolveReadScope(scope: ReadScope = 'own'): { key: string; filter?: string } {
  if (scope === 'all') return { key: 'all' };
  if (scope !== 'own') {
    const emails = [...new Set(scope.emails.map(e => (e || '').trim().toLowerCase()).filter(Boolean))].sort();
    if (emails.length > 0) {
      const params: Record<string, string> = {};
      emails.forEach((e, i) => { params[`e${i}`] = e; });
      return { key: `emails:${emails.join(',')}`, filter: pbFilter(emails.map((_, i) => `email = {:e${i}}`).join(' || '), params) };
    }
  }
  const own = (getSessionEmail() || '').toLowerCase();
  // No signed-in user: fetch nothing rather than everyone's rows.
  return own
    ? { key: own, filter: pbFilter('email = {:email}', { email: own }) }
    : { key: 'none', filter: 'email = ""' };
}

export async function pbGetIdSetMap(collection: string, field: string, readScope: ReadScope = 'own'): Promise<Record<string, string[]>> {
  const scope = resolveReadScope(readScope);
  const map = await coalesce(`idset:${collection}:${field}:${scope.key}`, READ_MAP_TTL_MS, async () => {
    const rows = await pb.collection(collection).getFullList({ requestKey: null, batch: 200, fields: `email,${field}`, ...(scope.filter ? { filter: scope.filter } : {}) });
    const built: Record<string, string[]> = {};
    (rows as PbRow[]).forEach(r => {
      const ids: string[] = Array.isArray(r[field]) ? r[field] : [];
      ids.forEach(id => {
        if (!built[id]) built[id] = [];
        built[id].push(r.email);
      });
    });
    return built;
  });
  return cloneMap(map);
}

export async function pbMarkIdsInField(collection: string, field: string, entityIds: string[], email: string): Promise<void> {
  if (!email || entityIds.length === 0) return;
  const emailLower = email.toLowerCase();
  let existing: PbJson = null;
  try {
    existing = await pb.collection(collection).getFirstListItem(pbFilter('email = {:email}', { email: emailLower }), { requestKey: null });
  } catch {
    existing = null;
  }
  const current: string[] = existing && Array.isArray(existing[field]) ? existing[field] : [];
  const merged = Array.from(new Set([...current, ...entityIds]));
  if (existing) {
    if (merged.length === current.length) return; // nothing new to persist
    await pb.collection(collection).update(existing.id, { [field]: merged }, { requestKey: null });
  } else {
    await pb.collection(collection).create({ email: emailLower, [field]: merged }, { requestKey: null });
  }
  // Next read of this map must see the write.
  invalidateCache(`idset:${collection}:`);
}

export async function pbGetReadMap(collection: string, readScope: ReadScope = 'own'): Promise<Record<string, string[]>> {
  const scope = resolveReadScope(readScope);
  const map = await coalesce(`readmap:${collection}:${scope.key}`, READ_MAP_TTL_MS, async () => {
    const rows = await pb.collection(collection).getFullList({ requestKey: null, batch: 200, fields: 'entity_id,email', ...(scope.filter ? { filter: scope.filter } : {}) });
    const built: Record<string, string[]> = {};
    (rows as PbRow[]).forEach(r => {
      if (!built[r.entity_id]) built[r.entity_id] = [];
      built[r.entity_id].push(r.email);
    });
    return built;
  });
  return cloneMap(map);
}

export async function pbMarkRead(collection: string, entityId: string, email: string): Promise<void> {
  if (!entityId || !email) return;
  try {
    await pb.collection(collection).create({
      read_key: `${entityId}_${email.toLowerCase()}`,
      entity_id: entityId,
      email,
    }, { requestKey: null });
  } catch {
    // Unique index on read_key rejected a duplicate — already read by this
    // person, which is exactly the postcondition the caller wants, so this
    // is success, not an error.
  }
  invalidateCache(`readmap:${collection}`);
}

export const formatMoney = (amount: number, region?: 'USA' | 'Pakistan') =>
  region === 'USA' ? `$${amount.toLocaleString()}` : `PKR ${amount.toLocaleString()}`;

export function formatDurationBetween(startISO: string, endISO: string): string {
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
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
// 'hr_admin' link kind's id; teams.ts's HR & Admin Line forwarding and the
// sidebar's activity dots use it directly) and neither should
// depend on the other just for this constant.
export const HR_ADMIN_LINE_TEAM_ID = 'hr_admin_line';

export const sharedActions = {
  // ── KV Overlay Helpers ───────────────────────────────────────────────
  // deleteKV removed (2026-09-10) — its only caller (GoogleIntegrationCard's
  // disconnect flow) now goes through the authenticated
  // /api/google/integration route instead (see that route's own comment).
  getKV: async (key: string): Promise<PbJson | null> => pbGetKV(key),
  setKV: async (key: string, value: PbJson): Promise<void> => pbSetKV(key, value),

};
