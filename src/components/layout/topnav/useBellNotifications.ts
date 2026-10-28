'use client';

import { useEffect, useMemo, useState } from 'react';
import { hrActions, useNotifications, type Notification } from '@/lib/hrData';
import { DEFAULT_NOTIFICATION_LIMIT } from '@/lib/hr/notifications';

type Maps = { read: Record<string, string[]>; cleared: Record<string, string[]> };

// The bell's data and actions for the signed-in person: their notifications, the unread count, mark-as-read on
// opening, delete one, clear all and "load older". The query already returns only what is addressed to this person
// or broadcast to their role (see useNotifications), so only what they dismissed is filtered out here.
export function useBellNotifications({ role, email }: { role: string | null; email: string | null }) {
  const [limit, setLimit] = useState(DEFAULT_NOTIFICATION_LIMIT);
  const { data: all, isFetching, refetch } = useNotifications(limit);
  // Ids hidden from the bell right away (delete / clear-all) while the server catches up.
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  // Per-user read and dismissed marks for broadcasts live in their own collections (see hrActions.getNotificationReadMap),
  // fetched into state so read/cleared can be computed synchronously during render.
  const [maps, setMaps] = useState<Maps>({ read: {}, cleared: {} });
  const [clearing, setClearing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchMaps = () => Promise.all([hrActions.getNotificationReadMap(), hrActions.getNotificationClearedMap()]).then(([read, cleared]): Maps => ({ read, cleared }));
  const loadMaps = async () => setMaps(await fetchMaps());
  useEffect(() => { void fetchMaps().then(setMaps); }, []); // once, on mount

  const notifications = useMemo(
    () => email ? (all ?? []).filter(n => !hrActions.isNotificationCleared(n, email, maps.cleared) && !hiddenIds.has(n.id)) : [],
    [all, email, maps.cleared, hiddenIds],
  );
  const isUnread = (n: Notification) => !!email && !hrActions.isNotificationRead(n, email, maps.read);
  const unreadCount = notifications.filter(isUnread).length;

  // Called when the bell opens. Personal notifications get `read: true` on the record itself, so the list is
  // refetched too, and the bell re-renders without waiting for the next poll.
  const markAllRead = async () => {
    if (!email || !role) return;
    await hrActions.markNotificationsAsRead(notifications, email, role);
    await loadMaps();
    void refetch();
  };

  // Personal notifications are removed for real; broadcasts are dismissed for this person only, so everyone else in
  // the role keeps them. The rows go at once, and the refetch then pulls the next-oldest ones into the page.
  const remove = async (items: Notification[]) => {
    if (!email || !role) return;
    setHiddenIds(prev => new Set([...prev, ...items.map(x => x.id)]));
    try {
      await hrActions.deleteNotificationsFor(items, email, role);
      await loadMaps();
    } catch {
      setHiddenIds(prev => { const next = new Set(prev); items.forEach(x => next.delete(x.id)); return next; }); // it did not go through: put them back
    } finally {
      void refetch();
    }
  };
  const clearAll = async () => {
    if (notifications.length === 0 || clearing) return;
    setClearing(true);
    try { await remove(notifications); } finally { setClearing(false); }
  };
  const deleteOne = async (n: Notification) => {
    if (deletingId) return;
    setDeletingId(n.id);
    try { await remove([n]); } finally { setDeletingId(null); }
  };

  return {
    notifications, unreadCount, isUnread, clearing, deletingId, markAllRead, clearAll, deleteOne,
    canLoadMore: (all?.length ?? 0) >= limit, loadingMore: isFetching, loadMore: () => setLimit(n => n + DEFAULT_NOTIFICATION_LIMIT),
  };
}
