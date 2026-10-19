'use client';
// Navigation "unseen activity" dots — data layer. The rules live in
// ../core/activity.ts; read that file's header first.
//
//  - touchActivity(): called when something happens (a chat message, a ticket
//    reply...). It OVERWRITES the scope's single hr_activity row, so the newest
//    event always replaces the previous one.
//  - useActivityRows(): everyone's view of those rows. Pushed live over
//    PocketBase realtime (so a dot appears the moment the event happens), with a
//    slow idle-aware poll as a safety net for a dropped connection.
//  - useActivitySeen(): what this person last looked at, kept server-side (so a
//    dot cleared on the phone is cleared on the laptop) with a local mirror so
//    the first paint doesn't flicker.
//  - useNavDots(): ties it together for the sidebar, and marks the page that is
//    currently open as seen — which is what keeps a dot from appearing for the
//    page you're already on.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { pb } from '../pocketbase';
import { every } from '../idle';
import { POLL_OPTIONS } from './polling';
import { pbUpsertByField, pbFindByField } from './shared';
import type { PbRow } from '@/lib/pbTypes';
import {
  BASELINE_KEY, hasUnseen, markScopesSeen, mergeActivityRows, scopesForPage,
  type ActivityRow, type DotPage, type DotViewer, type SeenMap,
} from '../core/activity';

const ACTIVITY_KEY = ['hr_activity'] as const;
const SEEN_SAVE_DEBOUNCE_MS = 1500;
const localSeenKey = (email: string) => `hr_activity_seen_v1:${email.trim().toLowerCase()}`;

const toRow = (r: PbRow): ActivityRow => ({ scope: r.scope, actor: String(r.actor || '').toLowerCase(), at: r.at || '' });

/** Records that something happened in each scope, caused by `actorEmail`. Best-effort: never throws, never blocks the action that triggered it. */
export async function touchActivity(scopes: string[], actorEmail: string): Promise<void> {
  const actor = (actorEmail || '').trim().toLowerCase();
  if (!actor || scopes.length === 0) return;
  const at = new Date().toISOString();
  await Promise.all(scopes.map(scope => pbUpsertByField('hr_activity', 'scope', scope, { actor, at }).catch(() => undefined)));
}

export function useActivityRows(enabled: boolean = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ACTIVITY_KEY,
    enabled,
    queryFn: async (): Promise<ActivityRow[]> => {
      const rows = await pb.collection('hr_activity').getFullList({ fields: 'scope,actor,at', batch: 200, requestKey: null });
      return rows.map(toRow);
    },
    // Safety net only — the live feed below is what makes dots instant.
    refetchInterval: every(60_000),
    ...POLL_OPTIONS,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let unsubscribe: (() => Promise<void>) | undefined;
    pb.collection('hr_activity').subscribe('*', event => {
      if (event.action === 'delete') return;
      queryClient.setQueryData<ActivityRow[]>(ACTIVITY_KEY, previous => mergeActivityRows(previous || [], [toRow(event.record)]));
    }).then(stop => {
      if (cancelled) void stop(); else unsubscribe = stop;
    }).catch(() => { /* realtime unavailable — the poll above still delivers */ });
    return () => { cancelled = true; if (unsubscribe) void unsubscribe(); };
  }, [enabled, queryClient]);

  return query;
}

function readLocalSeen(email: string): SeenMap | undefined {
  try {
    const raw = window.localStorage.getItem(localSeenKey(email));
    return raw ? JSON.parse(raw) as SeenMap : undefined;
  } catch { return undefined; }
}

export function useActivitySeen(email: string | null) {
  const queryClient = useQueryClient();
  const key = useMemo(() => ['hr_activity_seen', (email || '').toLowerCase()] as const, [email]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = useQuery({
    queryKey: key,
    enabled: !!email,
    staleTime: Infinity, // this device is the authority while it's open; saves below keep the server in step
    initialData: () => (email && typeof window !== 'undefined' ? readLocalSeen(email) : undefined),
    queryFn: async (): Promise<SeenMap> => {
      const row = await pbFindByField('hr_activity_seen', 'email', email!.toLowerCase());
      const remote: SeenMap = row?.seen && typeof row.seen === 'object' ? row.seen : {};
      const local = readLocalSeen(email!) || {};
      // Per scope, whichever side has looked more recently wins.
      const merged: SeenMap = { ...remote };
      for (const [scope, at] of Object.entries(local)) if (at > (merged[scope] || '')) merged[scope] = at;
      // First time ever: start tracking from now so old history doesn't show up as dots.
      if (!merged[BASELINE_KEY]) merged[BASELINE_KEY] = new Date().toISOString();
      return merged;
    },
  });

  const save = useCallback((next: SeenMap) => {
    if (!email) return;
    queryClient.setQueryData(key, next);
    try { window.localStorage.setItem(localSeenKey(email), JSON.stringify(next)); } catch { /* storage blocked — server copy still saved */ }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      pbUpsertByField('hr_activity_seen', 'email', email.toLowerCase(), { seen: next }).catch(() => undefined);
    }, SEEN_SAVE_DEBOUNCE_MS);
  }, [email, key, queryClient]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  return { seen: query.data, save };
}

/** Which nav page (if any) a URL path is. */
export function pageForPath(pathname: string): DotPage | null {
  if (pathname.endsWith('/tickets')) return 'tickets';
  if (pathname.endsWith('/chat') || pathname.endsWith('/team-chats')) return 'chat';
  if (pathname.endsWith('/hr-admin')) return 'hr-admin';
  return null;
}

/** The sidebar's three dots. While a page is open, its scopes are continuously marked seen — no dot for the page you're on. */
export function useNavDots(viewer: DotViewer | null, pathname: string): Record<'tickets' | 'chat' | 'hrAdmin', boolean> {
  const { data: rows } = useActivityRows(!!viewer);
  const { seen, save } = useActivitySeen(viewer?.email ?? null);
  const rowMap = useMemo(() => new Map((rows || []).map(r => [r.scope, r])), [rows]);

  const openPage = pageForPath(pathname);
  useEffect(() => {
    if (!viewer || !seen || !openPage) return;
    const next = markScopesSeen(scopesForPage(openPage, viewer), rowMap, seen);
    if (next !== seen) save(next);
  }, [viewer, seen, openPage, rowMap, save]);

  if (!viewer || !seen) return { tickets: false, chat: false, hrAdmin: false };
  const dot = (page: DotPage) => page !== openPage && hasUnseen(scopesForPage(page, viewer), rowMap, seen, viewer.email);
  return { tickets: dot('tickets'), chat: dot('chat'), hrAdmin: dot('hr-admin') };
}
