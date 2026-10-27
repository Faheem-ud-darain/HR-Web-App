'use client';

import { useEffect, useMemo, useState } from 'react';
import { hrActions, TICKET_PRESENCE_STALE_MS, type Ticket, type TicketPresence, type TicketSeenState } from '@/lib/hrData';
import { setAdaptiveInterval } from '@/lib/idle';
import type { TicketRole } from './ticketHelpers';

// Typing indicator poll pace, and how fresh the ticket owner's "seen" marker must be (they refresh it every 8s
// while a ticket is open) to count as online.
const TYPING_POLL_MS = 5000;
const OWNER_ONLINE_WINDOW_MS = 25_000;

interface LiveStateArgs {
  role: TicketRole;
  currentEmail: string;
  selectedTicket: Ticket | null;
  tickets: Ticket[];
  isPrivileged: boolean;
  isTechnicalTeam: boolean;
}

// Everything that makes an open ticket feel live, with no UI of its own:
//  - HR heartbeat "I have this ticket open" (the employee sees a Live badge);
//  - the employee/team lead polling that presence for their tickets;
//  - the owner's "seen" marker, and HR/Admin polling it for the "Seen by..." receipt;
//  - the "X is typing..." poll, switched on only while the other side is actually here.
// Best-effort polling: this app has no realtime channel (see TicketPresence in hrData.ts).
export function useTicketLiveState({ role, currentEmail, selectedTicket, tickets, isPrivileged, isTechnicalTeam }: LiveStateArgs) {
  // HR side: heartbeat while a ticket is selected. Only HR heartbeats; Admin is read-only on tickets. The
  // presence row is cleared on cleanup (switching tickets, closing, leaving the page) so the badge disappears
  // promptly instead of waiting out the staleness window.
  useEffect(() => {
    // Admin is read-only on tickets: it must not write (or, on cleanup, delete) the shared presence row.
    if (!isPrivileged || role === 'admin' || !selectedTicket || selectedTicket.status === 'closed') return;
    const ticketId = selectedTicket.id;
    const email = currentEmail;
    const beat = () => hrActions.touchTicketPresence(ticketId, email, role);
    beat();
    const interval = setInterval(beat, 8000);
    return () => {
      clearInterval(interval);
      hrActions.clearTicketPresence(ticketId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the open ticket id/status so presence is not restarted on every reply
  }, [role, selectedTicket?.id, selectedTicket?.status, currentEmail]);

  // Employee/team-lead side: poll live presence for their own tickets (see getTicketPresencesForIds in hrData.ts).
  const [ticketPresences, setTicketPresences] = useState<TicketPresence[]>([]);
  useEffect(() => {
    if (role !== 'employee' && role !== 'team_lead') return;
    // Nothing to poll for: no setState here, the list simply stays as it is.
    if (tickets.length === 0) return;
    let cancelled = false;
    const ticketIds = tickets.map(t => t.id);
    const poll = async () => {
      const all = await hrActions.getTicketPresencesForIds(ticketIds);
      if (!cancelled) setTicketPresences(all);
    };
    poll();
    const stop = setAdaptiveInterval(poll, 8000);
    return () => { cancelled = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, tickets.map(t => t.id).join(',')]);

  const isTicketLiveWithHR = (ticketId: string): boolean =>
    hrActions.isTicketPresenceLive(ticketPresences.find(entry => entry.ticketId === ticketId && entry.role === 'hr'));

  // Owner side: mark the ticket "seen as of now" while the TICKET'S OWNER has it open, so HR/Admin can tell a
  // reply was read. Written ONLY by the owner's own view (HR reading it, or a Technical Support teammate opening
  // a colleague's ticket, must never make the owner look as if they had seen it). Durable: no cleanup on unmount.
  const ticketOwnerEmail = selectedTicket?.employeeEmail?.toLowerCase() || '';
  const viewerIsTicketOwner = !!ticketOwnerEmail && ticketOwnerEmail === (currentEmail || '').toLowerCase();
  useEffect(() => {
    if (!viewerIsTicketOwner || !selectedTicket) return;
    const ticketId = selectedTicket.id;
    const touch = () => hrActions.touchTicketSeenByEmployee(ticketId);
    touch();
    const interval = setInterval(touch, 8000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on ticket id and reply count: read receipts must not re-fire on unrelated ticket edits
  }, [viewerIsTicketOwner, selectedTicket?.id, selectedTicket?.replies.length]);

  // HR/Admin side: poll the open ticket's seen state for the receipt under their latest message. Technical
  // Support teammates poll it too, only as the owner's "is online" signal for typing (no receipt). Never polled
  // for the ticket's own owner. Tagged with its ticket id so switching tickets never shows the previous state;
  // undefined = still loading, null = loaded and the owner has never opened it.
  const [seenEntry, setSeenEntry] = useState<{ ticketId: string; state: TicketSeenState | null } | null>(null);
  const isHrOrAdmin = role === 'hr' || role === 'admin';
  const watchesOwner = (isHrOrAdmin || isTechnicalTeam) && !viewerIsTicketOwner;
  const ticketSeenState: TicketSeenState | null | undefined =
    watchesOwner && seenEntry && seenEntry.ticketId === selectedTicket?.id ? seenEntry.state : undefined;
  useEffect(() => {
    if (!watchesOwner || !selectedTicket) return;
    const ticketId = selectedTicket.id;
    let cancelled = false;
    const poll = async () => {
      const state = await hrActions.getTicketSeenState(ticketId);
      if (!cancelled) setSeenEntry({ ticketId, state });
    };
    poll();
    const stop = setAdaptiveInterval(poll, 8000);
    return () => { cancelled = true; stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on ticket id: resets per-ticket UI state only when the open ticket changes
  }, [watchesOwner, selectedTicket?.id]);

  // Is the OTHER side here right now? Typing can only happen if so, so the typing poll is off otherwise.
  // The owner looks for a live presence row left by someone else; staff look at the owner's "seen" marker.
  // Freshness is judged against `clockNow`, which ticks every few seconds while a ticket is open (set from a
  // timer callback, never during render).
  const [clockNow, setClockNow] = useState(0);
  useEffect(() => {
    if (!selectedTicket) return;
    const first = setTimeout(() => setClockNow(Date.now()), 0);
    const stop = setAdaptiveInterval(() => setClockNow(Date.now()), 5000, { skipWhenHidden: false });
    return () => { clearTimeout(first); stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on ticket id: resets per-ticket UI state only when the open ticket changes
  }, [selectedTicket?.id]);
  const otherPartyOnline = useMemo(() => {
    if (!selectedTicket || clockNow === 0) return false;
    const me = (currentEmail || '').toLowerCase();
    if (viewerIsTicketOwner) {
      return ticketPresences.some(p =>
        p.ticketId === selectedTicket.id && (p.email || '').toLowerCase() !== me &&
        clockNow - new Date(p.lastSeenAt).getTime() < TICKET_PRESENCE_STALE_MS);
    }
    const seenAt = ticketSeenState?.employeeSeenAt ? new Date(ticketSeenState.employeeSeenAt).getTime() : 0;
    return seenAt > 0 && clockNow - seenAt < OWNER_ONLINE_WINDOW_MS;
  }, [clockNow, ticketPresences, ticketSeenState, selectedTicket, viewerIsTicketOwner, currentEmail]);

  // "X is typing...": both HR and the employee can reply so both sides poll; Admin is excluded (read-only).
  const [typingEntry, setTypingEntry] = useState<{ ticketId: string; names: string[] } | null>(null);
  const typingPollActive = !(role === 'admin' || !selectedTicket || selectedTicket.status === 'closed' || !currentEmail);
  const typingNames: string[] =
    typingPollActive && otherPartyOnline && typingEntry && typingEntry.ticketId === selectedTicket?.id ? typingEntry.names : [];
  useEffect(() => {
    if (!typingPollActive || !otherPartyOnline || !selectedTicket) return;
    const ticketId = selectedTicket.id;
    let cancelled = false;
    const poll = () => {
      hrActions.getTypingUsers('ticket', ticketId, currentEmail).then(rows => {
        if (!cancelled) setTypingEntry({ ticketId, names: rows.map(r => r.displayName) });
      }).catch(() => {});
    };
    poll();
    const stop = setAdaptiveInterval(poll, TYPING_POLL_MS);
    return () => { cancelled = true; stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- typing poll is keyed on the open ticket id, not the whole ticket object
  }, [typingPollActive, otherPartyOnline, selectedTicket?.id, currentEmail]);

  // Clear THIS person's own typing marker when they leave the ticket (separate from the poll so it switching
  // on/off does not write anything).
  useEffect(() => {
    if (!typingPollActive || !selectedTicket) return;
    const ticketId = selectedTicket.id;
    return () => { hrActions.clearTypingState('ticket', ticketId, currentEmail).catch(() => {}); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- typing poll is keyed on the open ticket id, not the whole ticket object
  }, [typingPollActive, selectedTicket?.id, currentEmail]);

  return { isTicketLiveWithHR, ticketSeenState, typingNames };
}
