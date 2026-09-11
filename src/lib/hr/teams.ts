// src/lib/hr/teams.ts
// Warehouses, Teams, Team Chat (hr_messages), the HR & Admin Line
// forwarding channel, Team Chat read receipts, and Team Documents.
// Warehouses is folded in here (not its own module — the plan's 10-module
// list has no warehouses.ts) since warehouse management is small and
// closely tied to team/lead assignment. Extracted from the former
// hrData.ts monolith (plan 014). See plans/014-split-hrdata-monolith.md.

'use client';
import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { pb } from '../pocketbase';
import type {
  Warehouse, Profile, Team, Message, TeamDocument, Notification, NotificationReadMap,
} from './types';
import { pbList, pbCreate, pbUpdate, pbDelete, pbGetIdSetMap, pbMarkIdsInField, HR_ADMIN_LINE_TEAM_ID } from './shared';
import { hrActions, buildNotificationLink, updateProfileAdmin } from '../hrData';

// Read receipts for regular Team Chat messages — same shape again (message
// id -> emails who've viewed it). Kept as its own KV key/blob rather than
// reusing hr_announcement_reads_v1 since messages are a much higher-volume,
// ever-growing collection; if this ever becomes large enough to matter,
// pruning entries for messages older than some retention window (mirroring
// hrActions.checkScreenshotRetention's pattern) would be the next step —
// not needed yet at this app's scale.
type MessageReadMap = Record<string, string[]>;

function toWarehouse(w: any): Warehouse {
  return { id: w.id, name: w.name, latitude: Number(w.latitude), longitude: Number(w.longitude), radius: Number(w.radius) };
}

function toTeam(t: any): Team {
  return { id: t.id, name: t.name, leadEmail: t.lead_email || undefined, members: t.members || [], warehouseId: t.warehouse_id || undefined };
}

function toMessage(m: any): Message {
  return {
    id: m.id,
    teamId: m.team_id,
    senderEmail: m.sender_email,
    senderName: m.sender_name,
    text: m.text || undefined,
    attachmentUrl: m.attachment ? pb.files.getURL(m, m.attachment) : undefined,
    attachmentName: m.attachment_name || undefined,
    attachmentSize: typeof m.attachment_size === 'number' ? m.attachment_size : undefined,
    isAnnouncement: !!m.is_announcement,
    timestamp: m.created,
    isForward: !!m.is_forward,
    forwardKind: m.forward_kind || undefined,
    forwardLabel: m.forward_label || undefined,
    forwardLink: m.forward_link || undefined,
    forwardNote: m.forward_note || undefined,
  };
}

function toTeamDocument(d: any): TeamDocument {
  return {
    id: d.id,
    teamId: d.team_id,
    title: d.title,
    description: d.description || undefined,
    fileUrl: d.file ? pb.files.getURL(d, d.file) : '',
    fileName: d.file_name || d.file || 'file',
    fileSize: typeof d.file_size === 'number' ? d.file_size : undefined,
    uploadedByEmail: d.uploaded_by_email,
    uploadedByName: d.uploaded_by_name,
    uploadedByRole: d.uploaded_by_role || undefined,
    timestamp: d.created,
  };
}

export function useWarehouses() {
  return useQuery({ queryKey: ['hr_warehouses'], queryFn: async () => (await pbList('hr_warehouses')).map(toWarehouse) });
}

export function useTeams() {
  return useQuery({ queryKey: ['hr_teams'], queryFn: async () => (await pbList('hr_teams', { sort: 'name' })).map(toTeam) });
}

export function useMessages(teamId: string | null | undefined, limit: number = 50) {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!teamId) return;
    let unsubscribed = false;

    // Real-time delta sync subscription via PocketBase WebSocket
    pb.collection('hr_messages')
      .subscribe('*', (e) => {
        if (unsubscribed) return;
        if (e.record && e.record.team_id === teamId) {
          queryClient.invalidateQueries({ queryKey: ['hr_messages', teamId] });
        }
      })
      .catch((err) => {
        console.warn('[hrData] PocketBase realtime subscription fallback to polling:', err);
      });

    return () => {
      unsubscribed = true;
      pb.collection('hr_messages').unsubscribe('*').catch(() => {});
    };
  }, [teamId, queryClient]);

  return useQuery({
    queryKey: ['hr_messages', teamId, limit],
    queryFn: async () => {
      if (!teamId) return [];
      const rows = await pb.collection('hr_messages').getList(1, limit, {
        filter: `team_id = "${teamId}"`,
        sort: '-created',
        requestKey: null,
      });
      // Reverse to return in chronological order
      return rows.items.map(toMessage).reverse();
    },
    enabled: !!teamId,
    refetchInterval: 8000,
    staleTime: 4000,
  });
}

export function useAllMessages() {
  return useQuery({
    queryKey: ['hr_messages_all'],
    queryFn: async () => {
      try {
        const res = await pb.collection('hr_messages').getList(1, 100, { sort: '-created', requestKey: null });
        return res.items.map(toMessage);
      } catch (err) {
        console.error('[hrData] getList error in hr_messages:', err);
        return [];
      }
    },
    refetchInterval: 20000,
  });
}

export function useTeamDocuments(teamId: string | null | undefined) {
  return useQuery({
    queryKey: ['hr_team_documents', teamId],
    queryFn: async () => {
      if (!teamId) return [];
      const rows = await pbList('hr_team_documents', { filter: `team_id = "${teamId}"`, sort: '-created' });
      return rows.map(toTeamDocument);
    },
    enabled: !!teamId,
    refetchInterval: 15000,
  });
}

// specific team ids a member/lead belongs to. Own messages never count —
// you already "saw" what you just sent.
export function computeMessageActivitySignature(
  messages: Message[],
  myTeamIds: string[] | 'all',
  email: string,
): number {
  const emailLower = email.toLowerCase();
  return messages.filter(m =>
    (myTeamIds === 'all' || myTeamIds.includes(m.teamId)) &&
    m.senderEmail.toLowerCase() !== emailLower
  ).length;
}

function chatSeenStorageKey(role: string, email: string): string {
  return `hr_chat_seen_v1_${role}_${email.toLowerCase()}`;
}

export function hasUnseenMessageActivity(
  messages: Message[],
  myTeamIds: string[] | 'all',
  role: string,
  email: string,
): boolean {
  if (typeof window === 'undefined' || !email) return false;
  const current = computeMessageActivitySignature(messages, myTeamIds, email);
  const stored = Number(window.localStorage.getItem(chatSeenStorageKey(role, email)) || '0');
  return current > stored;
}

export function markMessageActivitySeen(
  messages: Message[],
  myTeamIds: string[] | 'all',
  role: string,
  email: string,
): void {
  if (typeof window === 'undefined' || !email) return;
  const current = computeMessageActivitySignature(messages, myTeamIds, email);
  window.localStorage.setItem(chatSeenStorageKey(role, email), String(current));
}

// ---------------------------------------------------------------------------
// HR & Admin Line unseen-activity — deliberately NOT the
// hasUnseenMessageActivity/useAllMessages pattern above. That pattern
// requires polling every hr_messages row (useAllMessages, 20s interval)
// just to compute a sidebar dot, which is exactly the always-on background
// load this feature was explicitly asked NOT to add before the HR & Admin
// page is actually opened (see the page components). Instead this drives
// the dot off `hr_notifications`, which is already polled app-wide for
// TopNav's bell (useNotifications, 15s interval) regardless of which page
// is open — so checking it here is free, not a new cost. Only once the HR
// & Admin page itself mounts does useMessages(HR_ADMIN_LINE_TEAM_ID) start
// polling that channel's actual messages.
//
// Broadcast notifications (recipientEmail === 'all') use the same
// per-user readMap-based "seen" tracking TopNav's bell already fetches via
// hrActions.getNotificationReadMap() — NOT the localStorage counter
// pattern the other hasUnseenX helpers above use, because that map is the
// one place "read" state for a broadcast row actually lives; there's no
// separate concept of "seen" to invent here.
export function hasUnseenHrAdminLineActivity(
  notifications: Notification[],
  readMap: NotificationReadMap,
  role: 'admin' | 'hr',
  email: string,
): boolean {
  if (!email) return false;
  return notifications.some(n =>
    n.category === 'hr_admin_line' &&
    n.recipientRole === role &&
    n.recipientEmail === 'all' &&
    !(readMap[n.id] || []).map(e => e.toLowerCase()).includes(email.toLowerCase())
  );
}

export const teamActions = {
  // ── Warehouses ────────────────────────────────────────────────────────
  addWarehouse: (wh: Omit<Warehouse, 'id'>) => pbCreate('hr_warehouses', wh),
  updateWarehouse: (id: string, updates: Partial<Warehouse>) => pbUpdate('hr_warehouses', id, updates),
  // hr_warehouses itself is out of scope for the hr_profiles/hr_payroll
  // access-control migration (still a public collection) — but this
  // function's cleanup pass DOES write hr_profiles.assigned_warehouses for
  // every affected employee, so that half is routed through the admin-gated
  // /api/admin/profile route (see updateProfileAdmin) instead of the public
  // client, same as the rest of this migration.
  deleteWarehouse: async (id: string, allProfiles: Profile[]): Promise<void> => {
    await pbDelete('hr_warehouses', id);
    await Promise.all(
      allProfiles
        .filter(p => p.assignedWarehouses?.includes(id))
        .map(p => updateProfileAdmin(p.id, { assignedWarehouses: (p.assignedWarehouses || []).filter(w => w !== id) }))
    );
  },

  // ── Teams (real hr_teams: name + leadEmail + members + warehouseId) ────
  addTeam: (name: string, warehouseId?: string) => pbCreate('hr_teams', { name, lead_email: '', members: [], warehouse_id: warehouseId || '' }),
  deleteTeam: (id: string) => pbDelete('hr_teams', id),
  updateTeamMembers: (id: string, members: string[]) => pbUpdate('hr_teams', id, { members }),
  updateTeamLead: (id: string, leadEmail: string) => pbUpdate('hr_teams', id, { lead_email: leadEmail }),
  updateTeamWarehouse: (id: string, warehouseId: string) => pbUpdate('hr_teams', id, { warehouse_id: warehouseId }),

  // ── Team Chat (hr_messages — see migration_data/create_messages_collection.py) ──
  // One channel per team, no DMs. `file` is optional; when present it's
  // uploaded as a real PocketBase file on the `attachment` field (multipart
  // FormData), not base64-in-JSON, so large images/PDFs stay cheap to store
  // and serve. UI-only team-scoping for now — see the security note in the
  // migration script; every hr_ collection is currently publicly
  // readable/writable, same as the rest of this app pre-production.
  sendMessage: async (teamId: string, senderEmail: string, senderName: string, text: string, file?: File, isAnnouncement?: boolean): Promise<void> => {
    if (!text.trim() && !file) return;
    if (file) {
      const form = new FormData();
      form.append('team_id', teamId);
      form.append('sender_email', senderEmail);
      form.append('sender_name', senderName);
      form.append('text', text.trim());
      form.append('attachment', file);
      form.append('attachment_name', file.name);
      form.append('attachment_size', String(file.size));
      if (isAnnouncement) form.append('is_announcement', 'true');
      // Bypass Vercel proxy for large file uploads (same as uploadTeamDocument)
      const res = await fetch('https://pb.delcargo.us/api/collections/hr_messages/records', {
        method: 'POST',
        body: form,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
    } else {
      await pbCreate('hr_messages', {
        team_id: teamId, sender_email: senderEmail, sender_name: senderName, text: text.trim(),
        is_announcement: !!isAnnouncement,
      });
    }
  },

  // ── HR & Admin Line forwarding (hr_messages, HR_ADMIN_LINE_TEAM_ID) ────
  // Single mechanism behind all 3 forward trigger points (TicketsView,
  // the admin/hr dashboard announcement panels, TeamChatView message
  // bubbles) — always lands in the one fixed HR & Admin channel, always
  // notifies the OTHER role (hr forwards -> notify admin, admin forwards
  // -> notify hr), never dedups (re-forwarding the same source is just
  // another independent message row — see the feature spec).
  //
  // `sourceLabel` means two different things depending on forwardKind:
  // for 'ticket'/'announcement' it's the source's title; for 'chat' it's
  // the source channel's display name (chat messages have no title) —
  // both are what the notification body and the forwarded card's snippet
  // line use, so one param covers it instead of two mutually-exclusive
  // ones. `sourceId` is the raw record id (ticket id / announcement id /
  // source teamId) — see the forwardLink comment on the Message interface
  // for why this is deliberately not a pre-built path.
  //
  // `attachmentUrl`/`attachmentName`, when present, are fetched and
  // re-uploaded as a REAL new attachment on the forwarded message (same
  // multipart FormData pattern as sendMessage's file branch /
  // uploadTeamDocument above) — not just a link back to the original
  // file, so the forwarded card is self-contained even if the source is
  // later deleted or its attachment expires.
  forwardToHrAdminLine: async (
    senderEmail: string,
    senderName: string,
    senderRole: 'hr' | 'admin',
    forwardKind: 'ticket' | 'announcement' | 'chat',
    sourceLabel: string,
    sourceId: string,
    note?: string,
    attachmentUrl?: string,
    attachmentName?: string,
  ): Promise<void> => {
    const trimmedNote = (note || '').trim();
    const baseFields: any = {
      team_id: HR_ADMIN_LINE_TEAM_ID, sender_email: senderEmail, sender_name: senderName, text: '',
      is_forward: true, forward_kind: forwardKind, forward_label: sourceLabel, forward_link: sourceId,
    };
    if (trimmedNote) baseFields.forward_note = trimmedNote;

    let attachmentCopied = false;
    if (attachmentUrl) {
      try {
        const fileRes = await fetch(attachmentUrl);
        if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status}`);
        const blob = await fileRes.blob();
        const file = new File([blob], attachmentName || 'attachment', { type: blob.type });
        const form = new FormData();
        Object.entries(baseFields).forEach(([k, v]) => form.append(k, String(v)));
        form.append('attachment', file);
        form.append('attachment_name', file.name);
        form.append('attachment_size', String(file.size));
        // Bypass Vercel proxy for large file uploads (same as sendMessage/uploadTeamDocument)
        const res = await fetch('https://pb.delcargo.us/api/collections/hr_messages/records', { method: 'POST', body: form });
        if (!res.ok) throw new Error(`Forward failed: ${res.status} ${await res.text()}`);
        attachmentCopied = true;
      } catch (err) {
        // Copying the original attachment failed — still forward the
        // message itself below rather than losing the whole forward over
        // one file fetch/upload error.
        console.error('[hrData] forwardToHrAdminLine: attachment copy failed, forwarding without it', err);
      }
    }
    if (!attachmentCopied) {
      await pbCreate('hr_messages', baseFields);
    }

    // Notify the OTHER role — see the header comment above. Always fires:
    // 'hr_admin_line' is a maintenance-style always-on category, not
    // gated by NotificationPrefs (see the type definition near the top of
    // this file). Best-effort: a failed notification shouldn't make the
    // forward itself look like it failed — the message above already sent.
    const otherRole: 'hr' | 'admin' = senderRole === 'hr' ? 'admin' : 'hr';
    const body = forwardKind === 'ticket'
      ? `${senderName} forwarded a ticket to you: "${sourceLabel}"`
      : forwardKind === 'announcement'
      ? `${senderName} forwarded an announcement: "${sourceLabel}"`
      : `${senderName} forwarded a message from ${sourceLabel}`;
    await hrActions.addNotification(
      'all', otherRole, body, 'hr_admin_line', senderName, senderEmail,
      buildNotificationLink(otherRole, 'hr_admin', HR_ADMIN_LINE_TEAM_ID),
    ).catch(err => console.error('[hrData] forwardToHrAdminLine: notification failed', err));
  },

  // ── Team Chat read receipts (hr_message_reads_v1) ──────────────────────
  // Small, "announcement styled" read receipts for regular chat messages —
  // same read-tracking pattern as getAnnouncementReadMap/markAnnouncementsSeen
  // above, scoped to whichever messages are currently loaded (i.e. the
  // channel someone has open), not the whole message history at once.
  getMessageReadMap: (): Promise<MessageReadMap> => pbGetIdSetMap('hr_message_reads', 'read_ids'),
  isMessageRead: (msg: Message, email: string, readMap: MessageReadMap): boolean =>
    (readMap[msg.id] || []).map(e => e.toLowerCase()).includes(email.toLowerCase()),
  // Called whenever someone has a channel's messages on screen — marks every
  // currently-loaded message as seen by them (own messages included is
  // harmless; the UI never shows a viewer facepile that includes the sender
  // themselves). Deliberately doesn't return the updated map for the same
  // "seen-on-arrival, not seen-on-render" reasoning as markAnnouncementsSeen.
  markMessagesSeen: async (messages: Message[], email: string): Promise<void> => {
    if (!email || messages.length === 0) return;
    await pbMarkIdsInField('hr_message_reads', 'read_ids', messages.map(m => m.id), email);
  },

  // ── Team Documents (hr_team_documents — see migration_data/create_team_documents_collection.py) ──
  // Per-team onboarding/instructional file library. Upload is UI-restricted
  // to Admin/HR/Team Lead (enforced in TeamDocumentsPanel.tsx, not the DB —
  // same open-rules posture as every other hr_ collection right now).
  uploadTeamDocument: async (
    teamId: string, title: string, description: string, file: File,
    uploaderEmail: string, uploaderName: string, uploaderRole: string
  ): Promise<void> => {
    const form = new FormData();
    form.append('team_id', teamId);
    form.append('title', title.trim());
    if (description.trim()) form.append('description', description.trim());
    form.append('file', file);
    form.append('file_name', file.name);
    form.append('file_size', String(file.size));
    form.append('uploaded_by_email', uploaderEmail);
    form.append('uploaded_by_name', uploaderName);
    form.append('uploaded_by_role', uploaderRole);
    // Bypass the Vercel proxy (/api/pb) for large file uploads to avoid Vercel's
    // strict 4.5MB Serverless Function payload limit, which would block videos.
    const res = await fetch('https://pb.delcargo.us/api/collections/hr_team_documents/records', {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Upload failed: ${res.status} ${errText}`);
    }
  },

  deleteTeamDocument: async (id: string): Promise<void> => {
    await pbDelete('hr_team_documents', id);
  },
};
