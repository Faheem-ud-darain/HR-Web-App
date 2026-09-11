// src/lib/hr/tickets.ts
// Support tickets, ticket "live" presence, the shared typing indicator
// (also used by Team Chat, scope='chat' — see teams.ts), and the ticket
// unseen-activity signature. Extracted from the former hrData.ts monolith
// (plan 014). See plans/014-split-hrdata-monolith.md.

'use client';
import { useQuery } from '@tanstack/react-query';
import { pb } from '../pocketbase';
import type { Ticket, TicketPresence, TicketSeenState, TypingState, TicketReply } from './types';
import {
  pbList, pbCreate, pbUpdate, pbDelete, pbUpsertByField, pbFindByField, pbDeleteByField,
} from './shared';
import { hrActions, buildNotificationLink, isTechnicalSupportMember } from '../hrData';

// shows a "Live" badge for any ticket whose presence hasn't gone stale.
// Backed by the dedicated hr_ticket_presence collection (one row per
// ticket, unique index on ticketId) — migrated off the old
// hr_ticket_presence_<id> KV-blob-per-ticket pattern, which was prone to
// duplicate rows for the same ticket (a bug the migration surfaced: one
// ticket had 41 duplicate KV rows) since a KV write there was a
// lookup-then-update rather than a database-enforced single row.
export const TICKET_PRESENCE_STALE_MS = 20 * 1000;

// this right now"), this never expires, so HR/Admin can tell whether a reply
// they sent has actually been read, same "Seen" convention as most chat
// apps. Written by the employee/team-lead's own TicketsView whenever they
// have a ticket selected (touched on an interval so it also advances if a
// new reply arrives while they're already looking at it), read by HR/Admin's
// TicketsView for whichever ticket is currently selected.
// hr_ticket_seen — one row per ticketId (plan 027 Phase 4), replacing the
// old hr_ticket_seen_<id> KV-blob-per-ticket pattern (same shape upgrade
// hr_ticket_presence got earlier — see its own comment above).


// "X is typing…" indicator — same KV-heartbeat idea as TicketPresence above,
// just keyed per (scope, id, senderEmail) instead of one row per ticket, since
// multiple people can be typing in the same team chat/ticket at once and we
// want to show all of them, not just the last one. Very short staleness
// window (a few seconds) since a typing indicator that lingers after someone
// actually stops typing reads as a bug, not a feature. Shared by both Team
// Chat (scope 'chat', id = teamId) and Tickets (scope 'ticket', id =
// ticketId) — see touchTypingState/clearTypingState/getTypingUsers below.
export const TYPING_STALE_MS = 5 * 1000;
// hr_typing_indicators — one row per (scope, scopeId, email) triple (plan
// 027 Phase 4), replacing the old hr_typing_<scope>_<scopeId>_<email> KV
// prefix-scan pattern. This collection pre-existed (earlier, unrecorded
// prep work — same recurring pattern as elsewhere in this plan) with a
// composite UNIQUE index on (scope, scope_id, email) already enforcing
// one row per triple — no separate key column needed — but no
// display_name column and admin-only rules; code below matches that real
// schema (display_name added via a one-off addFieldIfMissing call, rules
// fixed via makeCollectionPublic).
function toTypingState(row: any): TypingState {
  return { scope: row.scope, scopeId: row.scope_id, email: row.email, displayName: row.display_name || row.email, lastTypedAt: row.updated_at };
}
async function upsertTypingRow(scope: 'chat' | 'ticket', scopeId: string, email: string, displayName: string): Promise<void> {
  const emailLower = email.toLowerCase();
  const filter = `scope = "${scope}" && scope_id = "${scopeId.replace(/"/g, '\\"')}" && email = "${emailLower.replace(/"/g, '\\"')}"`;
  const data = { scope, scope_id: scopeId, email: emailLower, display_name: displayName, updated_at: new Date().toISOString() };
  try {
    const existing = await pb.collection('hr_typing_indicators').getFirstListItem(filter, { requestKey: null });
    await pb.collection('hr_typing_indicators').update(existing.id, data, { requestKey: null });
  } catch {
    try {
      await pb.collection('hr_typing_indicators').create(data, { requestKey: null });
    } catch {
      // Lost a create race against another tab for the same triple (the
      // unique index rejected the duplicate) — fall back to update.
      try {
        const existing = await pb.collection('hr_typing_indicators').getFirstListItem(filter, { requestKey: null });
        await pb.collection('hr_typing_indicators').update(existing.id, data, { requestKey: null });
      } catch { /* best-effort — a missed typing tick is harmless */ }
    }
  }
}
async function deleteTypingRow(scope: 'chat' | 'ticket', scopeId: string, email: string): Promise<void> {
  const emailLower = email.toLowerCase();
  const filter = `scope = "${scope}" && scope_id = "${scopeId.replace(/"/g, '\\"')}" && email = "${emailLower.replace(/"/g, '\\"')}"`;
  try {
    const existing = await pb.collection('hr_typing_indicators').getFirstListItem(filter, { requestKey: null });
    await pb.collection('hr_typing_indicators').delete(existing.id, { requestKey: null });
  } catch { /* already gone — fine */ }
}

function toTicket(t: any): Ticket {
  return { id: t.id, employeeName: t.employee_name, employeeEmail: t.employee_email, title: t.subject, description: t.description, department: t.department || 'hr', status: t.status, createdAt: t.created, replies: t.replies || [] };
}

export function useTickets(limit: number = 50, status?: 'open' | 'closed') {
  return useQuery({
    queryKey: ['hr_tickets', limit, status || 'all'],
    queryFn: async () => {
      try {
        const res = await pb.collection('hr_tickets').getList(1, limit, {
          sort: '-created',
          requestKey: null,
          ...(status ? { filter: `status = "${status}"` } : {}),
        });
        return res.items.map(toTicket);
      } catch (err) {
        console.error('[hrData] getList error in hr_tickets:', err);
        return [];
      }
    },
    refetchInterval: 8000,
  });
}

// ---------------------------------------------------------------------------
// Ticket activity "seen" tracking (client-side only, per role+email) — used
// to light up a small dot on the Support Tickets nav item when there's a
// new ticket or reply the viewer hasn't looked at yet.
// ---------------------------------------------------------------------------

// A single number that changes whenever there's new activity relevant to
// this viewer: for HR/Admin that's every ticket + every reply on every
// ticket (they see all of it); for employees/team leads it's just replies
// from HR/Admin on their own tickets (their own messages don't count).
export function computeTicketActivitySignature(
  tickets: Ticket[],
  role: 'admin' | 'hr' | 'employee' | 'team_lead',
  email: string,
): number {
  if (role === 'admin' || role === 'hr') {
    return tickets.reduce((sum, t) => sum + 1 + t.replies.length, 0);
  }
  const mine = tickets.filter(t => t.employeeEmail.toLowerCase() === email.toLowerCase());
  return mine.reduce((sum, t) => sum + t.replies.filter(r => r.senderRole === 'hr' || r.senderRole === 'admin').length, 0);
}

function ticketSeenStorageKey(role: string, email: string): string {
  return `hr_tickets_seen_v1_${role}_${email.toLowerCase()}`;
}

export function hasUnseenTicketActivity(
  tickets: Ticket[],
  role: 'admin' | 'hr' | 'employee' | 'team_lead',
  email: string,
): boolean {
  if (typeof window === 'undefined' || !email) return false;
  const current = computeTicketActivitySignature(tickets, role, email);
  const stored = Number(window.localStorage.getItem(ticketSeenStorageKey(role, email)) || '0');
  return current > stored;
}

export function markTicketActivitySeen(
  tickets: Ticket[],
  role: 'admin' | 'hr' | 'employee' | 'team_lead',
  email: string,
): void {
  if (typeof window === 'undefined' || !email) return;
  const current = computeTicketActivitySignature(tickets, role, email);
  window.localStorage.setItem(ticketSeenStorageKey(role, email), String(current));
}

export const ticketActions = {
  // ── Tickets ───────────────────────────────────────────────────────────
  // Returns the created Ticket (previously void) so callers can immediately
  // attach a file to it via addTicketReply — hr_tickets itself has no file
  // column, only `replies` does (see TicketReply comment above), so a
  // ticket-creation-time attachment has to be added as a follow-up reply
  // rather than a field on the ticket record itself.
  createTicket: async (ticket: { employeeName: string; employeeEmail: string; title: string; description: string; department: 'hr' | 'technical' }): Promise<Ticket> => {
    const created = await pbCreate('hr_tickets', {
      employee_email: ticket.employeeEmail, employee_name: ticket.employeeName, subject: ticket.title,
      description: ticket.description, department: ticket.department, status: 'open', priority: 'medium', category: 'general', assigned_to: '', resolution: '', replies: [],
    });
    // Admin also has a Tickets queue (admin/tickets) — this previously only
    // notified 'hr', same gap as leave requests.
    if (ticket.department === 'hr') {
      await hrActions.addNotification('all', 'hr', `New support ticket opened: "${ticket.title}" by ${ticket.employeeName}.`, 'ticket', ticket.title, ticket.employeeEmail, buildNotificationLink('hr', 'ticket', created.id));
    } else if (ticket.department === 'technical') {
      // Find all profiles on Technical Support / Internal Technical Support teams and notify them directly
      const profiles = await pbList('hr_profiles');
      const techEmails = profiles
        .filter((p: any) => isTechnicalSupportMember(p.teams))
        .map((p: any) => p.email)
        .filter(Boolean);
      for (const email of techEmails) {
        await hrActions.addNotification(email, 'employee', `New technical support ticket opened: "${ticket.title}" by ${ticket.employeeName}.`, 'ticket', ticket.title, ticket.employeeEmail, buildNotificationLink('employee', 'ticket', created.id));
      }
    }
    // Admin gets the same dashboard notification (Admin's Tickets queue
    // still shows it), but no push here — whichever department actually
    // owns the ticket (HR or Technical Support) already got pushed above,
    // so a duplicate phone buzz to every Admin for every single ticket
    // event company-wide was pure noise. Dropping the category makes this
    // a dashboard-only row (push_notifications.pb.js exits before the
    // hr_profiles role lookup + OneSignal send for non-pushable categories).
    await hrActions.addNotification('all', 'admin', `New support ticket opened: "${ticket.title}" by ${ticket.employeeName}.`, undefined, undefined, ticket.employeeEmail, buildNotificationLink('admin', 'ticket', created.id));
    return toTicket(created);
  },
  addTicketReply: async (ticket: Ticket, reply: Omit<TicketReply, 'id' | 'timestamp'>): Promise<void> => {
    const newReply: TicketReply = { ...reply, id: `rep_${Date.now()}`, timestamp: new Date().toISOString() };
    await pbUpdate('hr_tickets', ticket.id, { replies: [...ticket.replies, newReply] });
    if (reply.senderRole === 'hr' || reply.senderRole === 'admin' || (ticket.department === 'technical' && reply.senderRole !== 'employee')) {
      const senderLabel = ticket.department === 'technical' ? 'Technical Support' : (reply.senderRole === 'hr' ? 'HR' : 'Admin');
      await hrActions.addNotification(ticket.employeeEmail, 'employee', `Support response received from ${senderLabel} regarding ticket "${ticket.title}".`, 'ticket', ticket.title, undefined, buildNotificationLink('employee', 'ticket', ticket.id));
    } else {
      if (ticket.department === 'hr') {
        await hrActions.addNotification('all', 'hr', `New support message from ${ticket.employeeName} on ticket "${ticket.title}".`, 'ticket', ticket.title, ticket.employeeEmail, buildNotificationLink('hr', 'ticket', ticket.id));
      } else if (ticket.department === 'technical') {
        const profiles = await pbList('hr_profiles');
        const techEmails = profiles
          .filter((p: any) => isTechnicalSupportMember(p.teams))
          .map((p: any) => p.email)
          .filter(Boolean);
        for (const email of techEmails) {
          await hrActions.addNotification(email, 'employee', `New support message from ${ticket.employeeName} on technical ticket "${ticket.title}".`, 'ticket', ticket.title, ticket.employeeEmail, buildNotificationLink('employee', 'ticket', ticket.id));
        }
      }
      // Dashboard-only for Admin (see createTicket's admin notification
      // comment above) — HR or Technical already got the pushable copy.
      await hrActions.addNotification('all', 'admin', `New support message from ${ticket.employeeName} on ticket "${ticket.title}".`, undefined, undefined, ticket.employeeEmail, buildNotificationLink('admin', 'ticket', ticket.id));
    }
  },
  updateTicketStatus: async (ticket: Ticket, status: 'open' | 'closed'): Promise<void> => {
    await pbUpdate('hr_tickets', ticket.id, { status });
    await hrActions.addNotification(ticket.employeeEmail, 'employee', `Support ticket "${ticket.title}" was marked as ${status}.`, 'ticket', ticket.title, undefined, buildNotificationLink('employee', 'ticket', ticket.id));
    if (ticket.department === 'hr') {
      await hrActions.addNotification('all', 'hr', `Support ticket "${ticket.title}" is now ${status}.`, 'ticket', ticket.title, undefined, buildNotificationLink('hr', 'ticket', ticket.id));
    } else if (ticket.department === 'technical') {
      const profiles = await pbList('hr_profiles');
      const techEmails = profiles
        .filter((p: any) => isTechnicalSupportMember(p.teams))
        .map((p: any) => p.email)
        .filter(Boolean);
      for (const email of techEmails) {
        await hrActions.addNotification(email, 'employee', `Technical ticket "${ticket.title}" is now ${status}.`, 'ticket', ticket.title, undefined, buildNotificationLink('employee', 'ticket', ticket.id));
      }
    }
    // Dashboard-only for Admin — same reasoning as the create/reply notifications above.
    await hrActions.addNotification('all', 'admin', `Support ticket "${ticket.title}" is now ${status}.`, undefined, undefined, undefined, buildNotificationLink('admin', 'ticket', ticket.id));
    // Starts/clears the 15-day attachment-deletion timer (see
    // checkTicketAttachmentRetention below) — hr_tickets has no closedAt
    // column of its own, so this is tracked in the KV store the same way
    // tracking settings/heartbeats are. Re-opening clears the timer so a
    // ticket closed-then-reopened-then-closed-again gets a fresh 15 days
    // rather than deleting attachments early based on the first close.
    if (status === 'closed') {
      await pbUpsertByField('hr_ticket_closed_at', 'ticket_id', ticket.id, { closed_at: new Date().toISOString() });
    } else {
      await pbDeleteByField('hr_ticket_closed_at', 'ticket_id', ticket.id);
    }
  },
  // Best-effort, client-triggered (no server cron in this app — see
  // checkScreenshotRetention above for the same pattern) sweep that deletes
  // any file attachments left on a ticket's replies once the ticket has
  // been closed for 15+ days. Only strips the attachment fields —
  // messages/replies themselves stay intact, so the conversation history
  // remains readable, just without the (potentially sensitive) files.
  // Called from TicketsView.tsx whenever the Tickets page is open.
  checkTicketAttachmentRetention: async (): Promise<void> => {
    const TICKET_ATTACHMENT_RETENTION_MS = 15 * 24 * 60 * 60 * 1000;
    const closedRows = await pbList('hr_ticket_closed_at');
    const dueIds = closedRows
      .filter(r => {
        const closedAt = new Date(r.closed_at).getTime();
        return !isNaN(closedAt) && (Date.now() - closedAt) >= TICKET_ATTACHMENT_RETENTION_MS;
      })
      .map(r => r.ticket_id as string);
    if (dueIds.length === 0) return;

    const tickets = (await pbList('hr_tickets', { filter: dueIds.map(id => `id = "${id}"`).join(' || ') })).map(toTicket);
    for (const ticket of tickets) {
      const hasAttachments = ticket.replies.some(r => !!r.attachmentUrl);
      if (hasAttachments) {
        const scrubbedReplies = ticket.replies.map(r => {
          if (!r.attachmentUrl) return r;
          const { attachmentUrl, attachmentName, attachmentSize, ...rest } = r;
          return rest as TicketReply;
        });
        await pbUpdate('hr_tickets', ticket.id, { replies: scrubbedReplies });
      }
      // Whether or not there was anything to scrub (e.g. already cleaned up
      // by another tab), this ticket is done — stop tracking it.
      await pbDeleteByField('hr_ticket_closed_at', 'ticket_id', ticket.id);
    }
  },

  // ── Ticket "live" presence (see TicketPresence above) ───────────────────
  touchTicketPresence: async (ticketId: string, email: string, role: string): Promise<void> => {
    await pbUpsertByField('hr_ticket_presence', 'ticketId', ticketId, { email, role, lastSeenAt: new Date().toISOString() });
  },
  clearTicketPresence: async (ticketId: string): Promise<void> => {
    const row = await pbFindByField('hr_ticket_presence', 'ticketId', ticketId);
    if (row) await pbDelete('hr_ticket_presence', row.id);
  },
  getAllTicketPresences: async (): Promise<TicketPresence[]> =>
    await pbList('hr_ticket_presence'),
  // Scoped variant — fetches presence rows only for the given ticket IDs
  // (one server-side OR-filter, still a single request) instead of fetching
  // every row in hr_ticket_presence, which is one row per ticket in the
  // company that has EVER had a presence heartbeat, not just the ones a
  // given employee/team-lead actually has open. Pass the caller's own
  // visible ticket list (already filtered to "my tickets" upstream).
  getTicketPresencesForIds: async (ticketIds: string[]): Promise<TicketPresence[]> => {
    if (ticketIds.length === 0) return [];
    const filter = ticketIds.map(id => `ticketId = "${id.replace(/"/g, '\\"')}"`).join(' || ');
    return await pbList('hr_ticket_presence', { filter });
  },
  isTicketPresenceLive: (p: TicketPresence | null | undefined): boolean =>
    !!p?.lastSeenAt && (Date.now() - new Date(p.lastSeenAt).getTime()) < TICKET_PRESENCE_STALE_MS,

  // ── "X is typing…" indicator (see TypingState above) ────────────────────
  // Call on every keystroke in a composer (debounce on the caller's side —
  // TeamChatView/TicketsView call this at most once every ~1.5s while the
  // field is non-empty, not on every single keypress) while it's non-empty,
  // and call clearTypingState immediately on send/blur/empty so the
  // indicator disappears promptly rather than waiting out the stale window.
  touchTypingState: async (scope: 'chat' | 'ticket', scopeId: string, email: string, displayName: string): Promise<void> => {
    await upsertTypingRow(scope, scopeId, email, displayName);
  },
  clearTypingState: async (scope: 'chat' | 'ticket', scopeId: string, email: string): Promise<void> => {
    await deleteTypingRow(scope, scopeId, email);
  },
  // Returns everyone currently (non-stale) typing in this scope, excluding
  // the viewer themself — that's the filtering the UI needs directly.
  getTypingUsers: async (scope: 'chat' | 'ticket', scopeId: string, excludeEmail: string): Promise<TypingState[]> => {
    const escapedScopeId = scopeId.replace(/"/g, '\"');
    const rows = (await pbList('hr_typing_indicators', { filter: `scope = "${scope}" && scope_id = "${escapedScopeId}"` })).map(toTypingState);
    const now = Date.now();
    return rows.filter(r =>
      r.email.toLowerCase() !== excludeEmail.toLowerCase() &&
      !!r.lastTypedAt &&
      (now - new Date(r.lastTypedAt).getTime()) < TYPING_STALE_MS
    );
  },

  // ── Ticket "seen by employee" marker (see TicketSeenState above) ────────
  touchTicketSeenByEmployee: async (ticketId: string): Promise<void> => {
    await pbUpsertByField('hr_ticket_seen', 'ticket_id', ticketId, { employee_seen_at: new Date().toISOString() });
  },
  getTicketSeenState: async (ticketId: string): Promise<TicketSeenState | null> => {
    const row = await pbFindByField('hr_ticket_seen', 'ticket_id', ticketId);
    return row ? { ticketId: row.ticket_id, employeeSeenAt: row.employee_seen_at } : null;
  },
};
