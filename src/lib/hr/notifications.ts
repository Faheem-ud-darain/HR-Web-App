// src/lib/hr/notifications.ts
// Notifications (in-app bell + push prefs), Announcements, and System
// Maintenance Notices — grouped together because Announcements/Maintenance
// notices ride on the same hr_notifications broadcast mechanism as regular
// notifications. Extracted from the former hrData.ts monolith (plan 014).
// See plans/014-split-hrdata-monolith.md.

'use client';
import { useQuery } from '@tanstack/react-query';
import { pb } from '../pocketbase';
import { formatTimeNY, formatDateNY } from '../timezone';
import type {
  Announcement, Profile, MaintenanceNotice, NotificationCategory,
  NotificationPrefs, Notification, NotificationReadMap,
} from './types';
import { pbCreate, pbUpdate, pbDelete, pbList, pbFindByField, pbUpsertByField, pbGetReadMap, pbMarkRead, pbGetIdSetMap, pbMarkIdsInField } from './shared';
import { hrActions } from '../hrData';

// Shared "does this announcement apply to this person" check — the exact
// targeting rule employee/page.tsx's dashboard feed widget already used
// inline (region === 'usa'/'pakistan', or a specific warehouse-id list).
// Centralized here so AnnouncementPopup.tsx's blocking popup can never
// silently disagree with the feed widget about who an announcement is
// actually for.
export function isAnnouncementForProfile(ann: Announcement, profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  if (ann.target === 'all') return true;
  if (profile.region === 'USA' && ann.target === 'usa') return true;
  if (profile.region === 'Pakistan' && ann.target === 'pakistan') return true;
  if (Array.isArray(ann.target) && profile.assignedWarehouses) {
    return ann.target.some(wId => profile.assignedWarehouses?.includes(wId));
  }
  return false;
}

// Plan 027 Phase 3: hr_maintenance_notices is now a real collection (one
// row per notice) instead of one array-blob row; hr_maintenance_notice_reads
// is a read-receipt collection (see shared.ts's pbGetReadMap/pbMarkRead)
// instead of one shared map row.
function toMaintenanceNotice(m: any): MaintenanceNotice {
  return { id: m.id, title: m.title, message: m.message, startAt: m.start_at, endAt: m.end_at, createdBy: m.created_by, createdAt: m.created };
}
type MaintenanceNoticeReadMap = Record<string, string[]>;

type NotificationClearedMap = Record<string, string[]>;
// Same shape/pattern as NotificationReadMap (announcement id -> emails who've
// seen it) — kept as its own KV key since hr_announcements is a separate
// collection from hr_notifications, not a broadcast-notification row.
type AnnouncementReadMap = Record<string, string[]>;
// The 4 notification categories an employee can actually toggle on/off in
// their Settings (see NotificationPreferencesCard.tsx) — 'internal' is a
// 5th, non-configurable bucket for lower-signal ops notifications that
// only ever show in the in-app bell (see the comment on addNotification).
// 'maintenance' (System Maintenance Notices — see MaintenanceNotice below)
// is deliberately NOT included in NotificationPrefs/DEFAULT_NOTIFICATION_PREFS
// below — unlike the other 5 configurable categories, an employee should not
// be able to opt out of "the whole system is about to go down," so there's
// no toggle for it in Settings and no per-user preference to check.
// IMPORTANT CAVEAT (2026-08-04): this only means the client-side notification
// preferences UI/model don't offer an opt-out — whether a 'maintenance'
// notification actually fires a real OneSignal push still depends on
// pb_hooks/push_notifications.pb.js on the droplet recognizing 'maintenance'
// as one of its pushable categories server-side. That file isn't present in
// this repo checkout/session, so it could not be updated as part of this
// feature — see PROJECT_HISTORY.md for the exact server-side change needed.
// 'hr_admin_line' (HR & Admin channel — see HR_ADMIN_LINE_TEAM_ID below) is
// a 7th category, added the same way 'maintenance' was: always-fires,
// deliberately NOT included in NotificationPrefs/DEFAULT_NOTIFICATION_PREFS
// below, same reasoning — this is HR and Admin's own direct line to each
// other, not something either side should be able to silently opt out of.
const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { announcement: true, ticket: true, chat_mention: true, leave_task: true, shift: true };

// team_lead shares the employee route tree everywhere (see
// (dashboard)/layout.tsx — "there is no /team_lead route"), so it maps to
// the same /employee/* paths as 'employee'.
function roleBasePath(role: string): string {
  if (role === 'hr') return '/hr';
  if (role === 'admin') return '/admin';
  return '/employee'; // employee, team_lead, or anything else
}

export function buildNotificationLink(role: string, kind: 'ticket' | 'leave' | 'chat' | 'task' | 'announcement' | 'hr_admin', id: string): string {
  const base = roleBasePath(role);
  if (kind === 'ticket') return `${base}/tickets?ticketId=${id}`;
  if (kind === 'leave') return `${base}/leaves?leaveId=${id}`;
  if (kind === 'task') return `${base}/tasks?taskId=${id}`; // Tasks list doesn't deep-select by id yet — still lands on the right screen.
  // Announcements are composed/listed inline on the HR/Admin dashboard
  // page itself (admin/page.tsx, hr/page.tsx) — there's no dedicated
  // announcements page or deep-select-by-id support yet, so (like 'task'
  // above) this just lands on the right dashboard.
  if (kind === 'announcement') return base;
  // HR & Admin channel — same fixed route for every forward/message
  // notification into it, id is always HR_ADMIN_LINE_TEAM_ID.
  if (kind === 'hr_admin') return `${base}/hr-admin`;
  // Team Chat route differs per role even though the base doesn't follow
  // the simple /leaves, /tickets pattern.
  const chatPath = role === 'hr' || role === 'admin' ? `${base}/team-chats` : `${base}/chat`;
  return `${chatPath}?teamId=${id}`;
}

function toNotification(n: any): Notification {
  return { id: n.id, recipientEmail: n.recipient_email, recipientRole: n.recipient_role, message: n.message, timestamp: n.timestamp, created: n.created, read: !!n.read, link: n.link || undefined, category: n.category || undefined };
}

function toAnnouncement(a: any): Announcement {
  return { id: a.id, title: a.title, content: a.content, timestamp: a.timestamp, createdBy: a.created_by, target: a.target || a.target_role || 'all', important: !!a.pinned };
}

export function useNotifications() {
  return useQuery({
    queryKey: ['hr_notifications'],
    queryFn: async () => {
      try {
        const res = await pb.collection('hr_notifications').getList(1, 50, { sort: '-created', requestKey: null });
        return res.items.map(toNotification);
      } catch (err) {
        console.error('[hrData] getList error in hr_notifications:', err);
        return [];
      }
    },
    refetchInterval: 15000,
  });
}

export function useAnnouncements() {
  return useQuery({
    queryKey: ['hr_announcements'],
    queryFn: async () => (await pbList('hr_announcements', { sort: '-created' })).map(toAnnouncement),
    refetchInterval: 30000,
  });
}

export function useMaintenanceNotices() {
  return useQuery({
    queryKey: ['hr_maintenance_notices'],
    queryFn: () => hrActions.getMaintenanceNotices(),
    refetchInterval: 15000,
  });
}

export const notificationActions = {
  // ── Notifications ─────────────────────────────────────────────────────
  // `category` drives real push notifications (not just the in-app bell):
  // a PocketBase server-side hook (see pb_hooks/push_notifications.pb.js)
  // watches every new hr_notifications row, and if it has one of the 4
  // pushable categories below AND the recipient hasn't turned that category
  // off in their notification settings, it sends a real OneSignal push.
  // Omitting `category` (or passing 'internal') means this notification
  // only ever shows in the in-app bell, never as a push — used for the
  // many lower-signal/internal-ops notifications (geofencing check-ins,
  // screenshot retention, new-employee-registered, etc.) that aren't one
  // of the categories employees can actually configure.
  // pushTitle/senderEmail are optional, push-only extras (never shown in the
  // in-app bell, which always just renders `message`) consumed by
  // push_notifications.pb.js on the droplet to build a WhatsApp-style
  // notification: pushTitle becomes the bold title (a ticket's subject, the
  // Team Chat sender's name, etc. — falls back to a generic per-category
  // title server-side if omitted) and senderEmail lets the hook look up
  // that person's profile_picture in hr_profiles to use as the Android
  // large icon/avatar. Neither field is required — omit senderEmail for
  // system-generated notifications that don't really have a "contact".
  // `link` is a role-correct in-app path (e.g. "/hr/tickets?ticketId=abc123")
  // that TopNav's bell dropdown navigates to when this notification is
  // clicked — see buildNotificationLink() below for how callers construct
  // one per recipient role. Requires a `link` (text) field on the
  // hr_notifications collection; if that field hasn't been added in the
  // PocketBase admin yet, PocketBase silently drops the extra key on write
  // (same as happened with category/push_title/sender_email before those
  // were added) and clicking just won't navigate anywhere — not a crash,
  // just a no-op until the field exists.
  addNotification: async (email: string, role: string, message: string, category?: NotificationCategory, pushTitle?: string, senderEmail?: string, link?: string): Promise<void> => {
    await pbCreate('hr_notifications', {
      recipient_email: email, recipient_role: role, message, read: false,
      category: category || 'internal',
      push_title: pushTitle || '',
      sender_email: senderEmail || '',
      link: link || '',
      timestamp: formatTimeNY(new Date()),
    });
  },
  getNotificationReadMap: (): Promise<NotificationReadMap> => pbGetIdSetMap('hr_notification_reads', 'read_ids'),
  getNotificationClearedMap: (): Promise<NotificationClearedMap> => pbGetIdSetMap('hr_notification_cleared', 'cleared_ids'),
  markNotificationsAsRead: async (notifications: Notification[], email: string, role: string): Promise<void> => {
    const personal = notifications.filter(n => n.recipientEmail === email && !n.read);
    await Promise.all(personal.map(n => pbUpdate('hr_notifications', n.id, { read: true })));

    const broadcasts = notifications.filter(n => n.recipientRole === role && n.recipientEmail === 'all');
    if (broadcasts.length === 0) return;
    await pbMarkIdsInField('hr_notification_reads', 'read_ids', broadcasts.map(n => n.id), email);
  },
  isNotificationRead: (n: Notification, email: string, readMap: NotificationReadMap): boolean => {
    if (n.recipientEmail === email) return n.read;
    if (n.recipientEmail === 'all') return (readMap[n.id] || []).map(e => e.toLowerCase()).includes(email.toLowerCase());
    return n.read;
  },
  isNotificationCleared: (n: Notification, email: string, clearedMap: NotificationClearedMap): boolean =>
    (clearedMap[n.id] || []).map(e => e.toLowerCase()).includes(email.toLowerCase()),
  clearAllNotificationsFor: async (notifications: Notification[], email: string, role: string): Promise<void> => {
    await hrActions.markNotificationsAsRead(notifications, email, role);
    const visible = notifications.filter(n => n.recipientEmail.toLowerCase() === email.toLowerCase() || (n.recipientEmail === 'all' && n.recipientRole === role));
    if (visible.length === 0) return;
    await pbMarkIdsInField('hr_notification_cleared', 'cleared_ids', visible.map(n => n.id), email);
  },

  // ── Push notification preferences (hr_notification_prefs_v1) ───────────
  // Per-employee opt-in/out for each pushable category — read by the
  // PocketBase server-side hooks before sending a real OneSignal push (the
  // in-app bell notification always still gets created regardless; this
  // only controls whether a push is also sent for it). Missing categories
  // for a given email default to "on" (opt-out model), both here and in
  // the hook, so someone who's never opened Settings still gets pushes.
  getNotificationPrefs: async (email: string): Promise<NotificationPrefs> => {
    const row = await pbFindByField('hr_notification_prefs', 'email', email.toLowerCase());
    return { ...DEFAULT_NOTIFICATION_PREFS, ...((row?.prefs as Partial<NotificationPrefs>) || {}) };
  },
  updateNotificationPrefs: async (email: string, prefs: NotificationPrefs): Promise<void> => {
    await pbUpsertByField('hr_notification_prefs', 'email', email.toLowerCase(), { prefs });
  },

  // ── Announcements ─────────────────────────────────────────────────────
  // `important` writes into the pre-existing `pinned` column (see the
  // Announcement.important comment in the interface above) — no schema
  // migration needed, it just repurposes a column that already existed and
  // was always hardcoded to `false`.
  addAnnouncement: (title: string, content: string, target: Announcement['target'], createdBy: string, important: boolean = false) =>
    pbCreate('hr_announcements', {
      title, content, created_by: createdBy, target: typeof target === 'string' ? target : 'all',
      target_role: typeof target === 'string' ? target : 'all', author: createdBy, author_role: '', pinned: important,
      timestamp: formatTimeNY(new Date()) + ' ' + formatDateNY(new Date()),
    }),
  getAnnouncementReadMap: (): Promise<AnnouncementReadMap> => pbGetIdSetMap('hr_announcement_reads', 'read_ids'),
  isAnnouncementRead: (ann: Announcement, email: string, readMap: AnnouncementReadMap): boolean =>
    (readMap[ann.id] || []).map(e => e.toLowerCase()).includes(email.toLowerCase()),
  // Explicit "I acknowledge this" action for AnnouncementPopup's blocking
  // popup — as opposed to markAnnouncementsSeen below, which marks a whole
  // batch read merely because they were passively rendered in a feed. This
  // one only ever fires from the person's own button press, which is what
  // "make sure they've actually read it" requires for an `important`
  // announcement: it has to keep reappearing on every login/page refresh
  // until they explicitly press Mark as Read, not clear itself the moment
  // the popup happens to render. Shares the same hr_announcement_reads_v1
  // KV store as markAnnouncementsSeen/isAnnouncementRead, so marking one
  // read here also clears the passive feed's unread highlight, and vice
  // versa — one unified read-state, not two that could disagree.
  markAnnouncementRead: async (announcementId: string, email: string): Promise<void> => {
    await pbMarkIdsInField('hr_announcement_reads', 'read_ids', [announcementId], email);
  },
  // Called once the announcements a person can currently see have actually
  // been rendered on screen — writes read-state server-side for next visit,
  // but deliberately doesn't hand back the updated map, so the page that
  // just called this keeps showing the "unread" highlight for the remainder
  // of this visit instead of it vanishing the instant it renders (same
  // reasoning as the sidebar's unseen-ticket/chat dots: seen-on-arrival,
  // not seen-on-render).
  markAnnouncementsSeen: async (announcements: Announcement[], email: string): Promise<void> => {
    if (!email || announcements.length === 0) return;
    await pbMarkIdsInField('hr_announcement_reads', 'read_ids', announcements.map(ann => ann.id), email);
  },
  // Both HR and Admin can post announcements (see admin/page.tsx and
  // hr/page.tsx's Post Announcement forms), and both already see the same
  // shared "Recent Announcements" feed regardless of who posted — so
  // deletion follows the same trust model: either role can delete any
  // announcement, not just ones they personally posted.
  deleteAnnouncement: (id: string) => pbDelete('hr_announcements', id),

  // ── System Maintenance Notices ──────────────────────────────────────────
  // See MaintenanceNotice above for why this is a separate system from
  // Announcement rather than an "important announcement" variant.
  getMaintenanceNotices: (): Promise<MaintenanceNotice[]> =>
    pbList('hr_maintenance_notices', { sort: '-created' }).then(rows => rows.map(toMaintenanceNotice)),

  // Creates the notice AND broadcasts a real hr_notifications row (category
  // 'maintenance') to all four roles so it shows in every dashboard's bell
  // immediately, not just the blocking popup — same "broadcast to role='X',
  // email='all'" pattern used elsewhere (e.g. shift-auto-ended-by-tracker
  // notifying 'all'/'hr'). team_lead needs its own separate call despite
  // sharing the employee dashboard, since recipient_role is matched by
  // exact string elsewhere (markNotificationsAsRead/getVisibleNotifications)
  // and 'employee' broadcasts never reach 'team_lead' accounts or vice versa.
  //
  // NOTE (2026-08-04): passing category: 'maintenance' here only makes the
  // in-app bell show it. Whether this actually fires a real OneSignal push
  // depends on pb_hooks/push_notifications.pb.js on the droplet recognizing
  // 'maintenance' as a pushable category — that file isn't present in this
  // repo checkout, so it couldn't be updated as part of this feature. See
  // PROJECT_HISTORY.md for the exact change still needed there.
  addMaintenanceNotice: async (
    title: string, message: string, startAtIso: string, endAtIso: string, createdBy: string
  ): Promise<void> => {
    await pbCreate('hr_maintenance_notices', {
      title, message, start_at: startAtIso, end_at: endAtIso, created_by: createdBy,
    });

    await Promise.all(
      (['employee', 'team_lead', 'hr', 'admin'] as const).map(role =>
        hrActions.addNotification('all', role, `${title}: ${message}`, 'maintenance', 'System Maintenance', createdBy)
      )
    );
  },

  deleteMaintenanceNotice: async (id: string): Promise<void> => {
    await pbDelete('hr_maintenance_notices', id);
  },

  getMaintenanceNoticeReadMap: (): Promise<MaintenanceNoticeReadMap> =>
    pbGetReadMap('hr_maintenance_notice_reads'),

  isMaintenanceNoticeRead: (notice: MaintenanceNotice, email: string, readMap: MaintenanceNoticeReadMap): boolean =>
    (readMap[notice.id] || []).map(e => e.toLowerCase()).includes(email.toLowerCase()),

  markMaintenanceNoticeRead: async (noticeId: string, email: string): Promise<void> => {
    await pbMarkRead('hr_maintenance_notice_reads', noticeId, email);
  },

  // Both HR and Admin can post/manage these (per explicit product decision),
  // same shared-trust model as deleteAnnouncement above.
};
