'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useProfiles, useTickets, hrActions, TICKET_PRESENCE_STALE_MS, Ticket, TicketPresence, TicketSeenState, Profile, displayName, isTechnicalSupportMember } from '@/lib/hrData';
import { getSessionEmail } from '@/lib/session';
import { compressImageToWebP, validatePdfSize, fileToDataUrl, MAX_DOCUMENT_IMAGE_BYTES } from '@/lib/imageCompressor';
import { Plus, User, AlertCircle, Paperclip, X, FileText, Headset, Loader2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { formatDateNY } from '@/lib/timezone';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useActionToast } from '@/components/ui/ActionToastHost';
import { pushModal, popModal } from '@/lib/modalStack';
import { useNativeKeyboard } from '@/hooks/useNativeKeyboard';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { SearchInput } from '@/components/ui/SearchInput';
import { ticketActivityMs } from "@/components/ui/tickets/ticketHelpers";
import { TicketListPanel } from "@/components/ui/tickets/TicketListPanel";
import { TicketConversationPanel } from "@/components/ui/tickets/TicketConversationPanel";
import { setAdaptiveInterval } from '@/lib/idle';
import { useSessionEmail } from '@/lib/useSession';

// Converts an uploaded attachment File to a storable data URL: images are
// compressed to WebP (max 3 MB), PDFs are stored as-is after a size check
// (max 5 MB) — mirrors the same helper in employee/profile/page.tsx, since
// hr_tickets has no dedicated file field to upload to (see the TicketReply
// comment in hrData.ts).
async function fileToStoredAttachment(file: File): Promise<{ data: string; error: string | null }> {
  if (file.type === 'application/pdf') {
    const err = validatePdfSize(file);
    if (err) return { data: '', error: err };
    return { data: await fileToDataUrl(file), error: null };
  }
  if (file.type.startsWith('image/')) {
    const data = await compressImageToWebP(file, 0.8, MAX_DOCUMENT_IMAGE_BYTES);
    return { data, error: null };
  }
  return { data: '', error: 'Only image files or PDFs are supported.' };
}

// Shared formatter for every timestamp shown on this screen: Ticket.
// createdAt (PocketBase's raw `created` system field, e.g. "2026-07-24
// 16:18:33.852Z") and TicketReply.timestamp (an ISO string as of the
// addTicketReply fix in hrData.ts — see that comment for why it used to
// be a bare "04:18 PM" with no date, which silently discarded which day
// a reply happened on and made multi-day threads unreadable). Formats
// both the same way — full date + time — so the whole thread reads
// consistently instead of the opening message showing a real date and
// every reply after it showing only a time.
//
// Legacy replies created before that fix are still stored as a bare
// "04:18 PM"-style string with no date at all. Handing that straight to
// `new Date(...)` is a trap: some JS engines will silently parse a
// time-only string as *today's* date at that time, which would display
// a wrong, made-up date rather than the honest "we don't know" — worse
// than the plain time it shows today. The regex below detects that exact
// legacy shape and returns it unchanged instead of risking a fabricated
// date.
// "Most recent activity" for sort purposes: a fresh reply on an old ticket
// should bump it back to the top of the list, same as any inbox/chat app —
// not just whichever ticket was originally opened most recently (that's
// all useTickets()'s own `sort: '-created'` query gives us, and it never
// changes again once a ticket exists). Takes the later of createdAt and the
// newest reply's timestamp.
//
// Legacy replies predating the addTicketReply timestamp fix (see the
// formatTicketDate comment above) are stored as a bare "04:18 PM" string
// with no date at all. `Date.parse` on a time-only string isn't reliably
// rejected the way `new Date(...)` sometimes is — some engines silently
// resolve it against *today's* date, which would make an old reply look
// like the most recent activity on every single ticket that has one,
// corrupting the whole sort. BARE_TIME_ONLY (already used above) is reused
// here to skip those entries entirely rather than let a bad parse in.

interface TicketsViewProps {
  role: 'admin' | 'hr' | 'employee' | 'team_lead';
}

// Typing indicator poll pace, and how fresh the ticket owner's "seen" marker must be (they
// refresh it every 8s while a ticket is open) to count as online.
const TYPING_POLL_MS = 5000;
const OWNER_ONLINE_WINDOW_MS = 25_000;

export function TicketsView({ role }: TicketsViewProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const currentEmail = useSessionEmail() || '';
  const [userProfile, setUserProfile] = useState<Profile | null>(null);

  // Track native keyboard height so the ticket panel can pad itself above
  // the keyboard on iOS/Android (see the panel's style.paddingBottom below).
  const { keyboardHeight } = useNativeKeyboard();

  // Modals
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [department, setDepartment] = useState<'hr' | 'technical'>('hr');
  const [inspectEmployee, setInspectEmployee] = useState<Profile | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxName, setLightboxName] = useState<string | undefined>(undefined);

  // "Forward" (HR & Admin Line) — shown to hr/admin only, gated by `role`
  // directly rather than `isPrivileged` (which also covers Technical Team
  // members on employee/team_lead accounts — this action is HR/Admin's
  // private line to each other, not extended to Technical Team). Works
  // for closed tickets too (no status restriction — see the feature
  // spec), and re-forwarding is unrestricted: no dedup, each forward is
  // just a new independent hr_messages row. A Ticket has no attachment
  // field of its own (only TicketReply does), so a forwarded ticket never
  // carries a copied attachment.
  const canForwardToHrAdmin = role === 'hr' || role === 'admin';
  const [forwardingTicket, setForwardingTicket] = useState<Ticket | null>(null);
  const [forwardNote, setForwardNote] = useState('');
  const [isForwarding, setIsForwarding] = useState(false);
  const [forwardError, setForwardError] = useState('');

  const submitTicketForward = async () => {
    if (!forwardingTicket || isForwarding) return;
    setIsForwarding(true);
    setForwardError('');
    try {
      const forwarderName = userProfile?.fullName || (role === 'hr' ? 'HR Manager' : 'System Admin');
      await hrActions.forwardToHrAdminLine(
        currentEmail,
        forwarderName,
        role === 'admin' ? 'admin' : 'hr',
        'ticket',
        forwardingTicket.title,
        forwardingTicket.id,
        forwardNote,
      );
      setForwardingTicket(null);
      setForwardNote('');
    } catch (err) {
      console.error('Forward ticket failed:', err);
      setForwardError('Could not forward that ticket. Please try again.');
    } finally {
      setIsForwarding(false);
    }
  };

  // On mobile, an open ticket becomes a fixed full-screen overlay (see the
  // `selectedTicket ? '... fixed inset-x-0 top-0 bottom-[64px] ...'` panel
  // below) — visually it IS a full-screen modal, so it should hide the
  // floating bottom pill nav the same way any other modal does (via
  // modalStack), rather than hiding the nav for the whole /tickets route
  // (which incorrectly hid it on the ticket list too, before any ticket
  // was open).
  const hasSelectedTicket = !!selectedTicket;
  useEffect(() => {
    if (hasSelectedTicket) {
      pushModal();
      return () => popModal();
    }
  }, [hasSelectedTicket]);

  const isTechnicalTeam = isTechnicalSupportMember(userProfile?.teams);
  const isPrivileged = role === 'hr' || role === 'admin' || isTechnicalTeam;

  // Ticket/reply records only ever snapshot a name string (employeeName /
  // senderName), not a live Profile reference, so resolving an alias for
  // HR/Admin viewers needs a lookup against the current employees list —
  // falls back to the raw snapshot if no match is found (e.g. a deleted
  // employee, or one of the "HR Manager"/"System Admin" fallback labels).
  const nameFor = (name: string): string => {
    if (!isPrivileged) return name;
    const emp = employees.find(e => e.fullName === name);
    return emp ? displayName(emp, role as 'hr' | 'admin') : name;
  };

  // Same snapshot-name lookup as nameFor(), but returns the matched profile
  // itself so the description/reply avatars below can show the sender's
  // real photo instead of a bare initials circle — that was the actual gap
  // here, not a rendering bug: these avatars never pulled from a Profile at
  // all before this.
  const profileFor = (name: string): Profile | undefined => employees.find(e => e.fullName === name);

  // Ticket list filters — default to 'open' tickets for active queue view
  const isPrivilegedOrTech = role === 'hr' || role === 'admin' || isTechnicalTeam;
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>(isPrivilegedOrTech ? 'open' : 'all');
  const [deptFilter, setDeptFilter] = useState<'all' | 'hr' | 'technical'>('all');
  const [viewTab, setViewTab] = useState<'assigned' | 'my_tickets'>('assigned');
  const [searchQuery, setSearchQuery] = useState('');
  const [ticketLimit, setTicketLimit] = useState<number>(50);

  // Each status tab (All/Open/Closed) gets its own fresh 50 + Load More
  // count — otherwise clicking "Load More" a few times on Open and then
  // switching to Closed would carry over an inflated limit (e.g. 200) into
  // a tab that never asked for that many, fetching far more than needed.
  const [limitFor, setLimitFor] = useState(statusFilter);
  if (statusFilter !== limitFor) {
    setLimitFor(statusFilter);
    setTicketLimit(50);
  }

  const visibleTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const myEmailLower = (currentEmail || '').toLowerCase();

    return tickets
      .filter(t => statusFilter === 'all' || t.status === statusFilter)
      .filter(t => deptFilter === 'all' || t.department === deptFilter)
      .filter(t => {
        if (!isTechnicalTeam || role === 'admin') return true;
        if (viewTab === 'my_tickets') {
          return t.employeeEmail.toLowerCase() === myEmailLower;
        }
        // 'assigned': incoming technical support tickets from other employees (or technical tickets assigned to handle)
        return t.department === 'technical' && t.employeeEmail.toLowerCase() !== myEmailLower;
      })
      .filter(t => {
        if (!q) return true;
        return (
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.employeeName.toLowerCase().includes(q) ||
          nameFor(t.employeeName).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => ticketActivityMs(b) - ticketActivityMs(a));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- nameFor is a stable lookup over `employees`, which is already a dependency
  }, [tickets, statusFilter, deptFilter, viewTab, searchQuery, employees, isPrivileged, isTechnicalTeam, currentEmail, role]);

  // Form states
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [replyMsg, setReplyMsg] = useState('');
  const { showToast } = useActionToast();

  // Attachments
  const [newTicketFile, setNewTicketFile] = useState<File | null>(null);
  const [newTicketFileError, setNewTicketFileError] = useState('');
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [replyFileError, setReplyFileError] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [isOpeningTicket, setIsOpeningTicket] = useState(false);
  const [updatingTicketStatusId, setUpdatingTicketStatusId] = useState<string | null>(null);
  const newTicketFileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // "X is typing…" for the currently-open ticket — see the effect below.
  const [typingEntry, setTypingEntry] = useState<{ ticketId: string; names: string[] } | null>(null);
  const lastTypingTouchRef = useRef<number>(0);

  const appliedDeepLinkRef = useRef(false);

  const applyTickets = (all: Ticket[], email: string, profile: Profile | null) => {
    const isTech = isTechnicalSupportMember(profile?.teams);
    
    if (role === 'admin') {
      setTickets(all);
    } else if (role === 'hr') {
      setTickets(all.filter(t => t.department === 'hr'));
    } else if (isTech) {
      setTickets(all.filter(t => t.department === 'technical' || t.employeeEmail.toLowerCase() === email.toLowerCase()));
    } else {
      setTickets(all.filter(t => t.employeeEmail.toLowerCase() === email.toLowerCase()));
    }
    // Keep the open conversation live too, so incoming replies from other
    // users/devices show up without the viewer needing to reselect it.
    setSelectedTicket(prev => {
      if (!prev) return prev;
      return all.find(t => t.id === prev.id) || prev;
    });

    // Deep-link: open the ticket named in ?ticketId= (from a notification
    // click) the first time it shows up in a loaded ticket list.
    if (!appliedDeepLinkRef.current && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const targetId = params.get('ticketId');
      if (targetId) {
        const target = all.find(t => t.id === targetId);
        if (target) {
          appliedDeepLinkRef.current = true;
          setSelectedTicket(target);
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    }
  };

  const { data: allProfiles } = useProfiles();
  const { data: allTickets, isLoading: ticketsLoading, refetch: refetchTickets, isFetching: isFetchingTickets } = useTickets(
    ticketLimit,
    statusFilter === 'all' ? undefined : statusFilter,
  );

  useEffect(() => {
    const email = getSessionEmail() || '';
    
    let currentProfile = userProfile;
    if (allProfiles) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors server query data into the role-scoped local list/selection (applyTickets also keeps the open ticket live and handles the one-shot deep link)
      setEmployees(allProfiles);
      currentProfile = allProfiles.find(e => e.email && email && e.email.toLowerCase() === email.toLowerCase()) || null;
      setUserProfile(currentProfile);
    }

    if (allTickets) {
      applyTickets(allTickets, email, currentProfile);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync only when the fetched profiles/tickets change; applyTickets/userProfile are derived from them
  }, [role, allProfiles, allTickets]);

  // Scroll chat to bottom when replies change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedTicket?.replies, typingEntry?.names.length]);

  // Best-effort sweep for attachments on tickets closed 15+ days ago — see
  // checkTicketAttachmentRetention in hrData.ts. There's no server cron in
  // this app, so this only runs when someone actually opens the Tickets
  // page (same pattern as checkScreenshotRetention elsewhere); a 15-day
  // window doesn't need a tight polling interval, so this just runs once
  // per page visit and refetches so a just-scrubbed attachment disappears
  // from view immediately.
  useEffect(() => {
    hrActions.checkTicketAttachmentRetention().then(() => refetchTickets());
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only attachment retention sweep; refetchTickets is not a trigger
  }, []);

  // HR side: heartbeat "I have this ticket open" while it's selected, so
  // the employee's view can show a Live badge (see TicketPresence in
  // hrData.ts). Only HR heartbeats here — Admin is read-only on tickets and
  // isn't the one actually chatting with the employee. Clears the presence
  // row on cleanup (switching tickets, closing the ticket, or leaving the
  // page) so the badge disappears promptly rather than waiting out the
  // staleness window.
  useEffect(() => {
    if (!isPrivileged || !selectedTicket || selectedTicket.status === 'closed') return;
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

  // Employee/team-lead side: poll every ticket's live presence so the
  // conversation panel (and the ticket list) can show a "Live — HR is
  // chatting" badge. Cheap best-effort polling (no realtime channel in this
  // app — see TicketPresence's doc comment).
  const [ticketPresences, setTicketPresences] = useState<TicketPresence[]>([]);
  useEffect(() => {
    if (role !== 'employee' && role !== 'team_lead') return;
    // No early setState here when tickets.length is 0 (that would call
    // setState synchronously in the effect body) — with nothing to poll
    // for, the async poll below just resolves to [] on its own and the
    // interval is skipped, so ticketPresences naturally has nothing to
    // show without needing a synchronous reset.
    if (tickets.length === 0) return;
    let cancelled = false;
    // Scoped to just this employee/team-lead's own visible tickets (see
    // getTicketPresencesForIds' comment in hrData.ts) instead of fetching
    // presence for every ticket in the company on every 8s poll.
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

  const isTicketLiveWithHR = (ticketId: string): boolean => {
    const presence = ticketPresences.find(entry => entry.ticketId === ticketId && entry.role === 'hr');
    return hrActions.isTicketPresenceLive(presence);
  };

  // Owner side: mark this ticket "seen as of now" while the TICKET'S OWNER has
  // it open, so HR/Admin can tell a reply was actually read (see
  // TicketSeenState in hrData.ts). It is written ONLY by the owner's own view:
  // HR/Admin reading a ticket — or a Technical Support teammate opening a
  // colleague's ticket — must never make the owner look as if they'd seen it.
  // Re-touched on an interval — not just once on open — so it also advances
  // past a reply that arrives while the ticket is already sitting open.
  // Unlike TicketPresence above, this is a durable marker: no cleanup on
  // unmount, since "last seen at this time" should stay true after they leave.
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

  // HR/Admin side: poll the currently-open ticket's seen state so the receipt
  // under their latest message ("Seen by …" / "Not seen yet") stays current
  // without a manual refresh. Technical Support teammates poll it too, but only
  // as the owner's "is online right now" signal for the typing indicator below
  // (they get no receipt). Never polled for the ticket's own owner.
  // The state the poll last fetched, tagged with the ticket it belongs to, so switching
  // tickets never shows the previous ticket's state while the new one loads.
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

  // Is the OTHER side of this conversation here right now? Typing can only happen if so,
  // so the typing poll below is switched off when they aren't.
  //  - the owner looks for a live presence row left by someone else (HR/Technical
  //    Support heartbeat it every 8s while they have the ticket open);
  //  - staff look at the owner's "seen" marker, which the owner refreshes every
  //    8s while they have it open.
  // Freshness is judged against `clockNow`, a clock that ticks every few seconds while a
  // ticket is open (state set from a timer callback, never during render).
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

  // "X is typing…" — poll the other side's typing state for the currently open
  // ticket, but only while they are actually here (see otherPartyOnline), every
  // 5s, skipping hidden tabs and slowing down when this person is idle.
  // Symmetric: both HR and the employee/team_lead can reply, so both sides run
  // this. Admin is excluded — replies are disabled for Admin (read-only), so
  // there's nothing for them to ever be typing.
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

  // Clear THIS person's own typing marker when they leave the ticket (separate
  // from the poll above so the poll switching on/off doesn't write anything).
  useEffect(() => {
    if (!typingPollActive || !selectedTicket) return;
    const ticketId = selectedTicket.id;
    return () => { hrActions.clearTypingState('ticket', ticketId, currentEmail).catch(() => {}); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- typing poll is keyed on the open ticket id, not the whole ticket object
  }, [typingPollActive, selectedTicket?.id, currentEmail]);

  const handleNewTicketFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setNewTicketFileError('');
    setNewTicketFile(file);
  };

  const handleReplyFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setReplyFileError('');
    setReplyFile(file);
  };

  const handleOpenTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOpeningTicket || !title || !desc || !userProfile) return;
    setNewTicketFileError('');

    setIsOpeningTicket(true);
    try {
      let attachment: { data: string; error: string | null } | null = null;
      if (newTicketFile) {
        attachment = await fileToStoredAttachment(newTicketFile);
        if (attachment.error) { setNewTicketFileError(attachment.error); return; }
      }

      const created = await hrActions.createTicket({
        employeeName: userProfile.fullName,
        employeeEmail: userProfile.email,
        title,
        description: desc,
        department,
      });

      // hr_tickets has no attachment column, so a file selected at filing time
      // is attached as an immediate follow-up reply on the freshly created
      // ticket instead (see createTicket's comment in hrData.ts).
      if (attachment && !attachment.error) {
        await hrActions.addTicketReply(created, {
          senderName: userProfile.fullName,
          senderRole: role,
          senderEmail: currentEmail,
          message: '',
          attachmentName: newTicketFile!.name,
          attachmentUrl: attachment.data,
          attachmentSize: newTicketFile!.size,
        });
      }

      refetchTickets();
      setIsNewOpen(false);
      setTitle('');
      setDesc('');
      setDepartment('hr');
      setNewTicketFile(null);
      showToast({ type: 'success', message: 'Support ticket opened successfully!' });
    } catch (err) {
      // fileToStoredAttachment can now throw (compressImageToWebP rejects
      // instead of silently storing an unusable file — see
      // imageCompressor.ts) — this previously had no catch at all, so a
      // failed attachment would surface as an unhandled promise rejection
      // with no message shown to the user.
      console.error('[Tickets] Failed to open ticket:', err);
      setNewTicketFileError(err instanceof Error ? err.message : 'Failed to attach this file. Please try again.');
    } finally {
      setIsOpeningTicket(false);
    }
  };

  // Shared by both the form's onSubmit and the textarea's Enter-to-send
  // keydown handler, so neither has to fake up a synthetic FormEvent.
  const sendReply = async () => {
    if ((!replyMsg.trim() && !replyFile) || !selectedTicket || sendingReply) return;
    setReplyFileError('');

    const isTech = isTechnicalSupportMember(userProfile?.teams);
    let senderName = currentEmail.split('@')[0];
    if (role === 'hr') senderName = 'HR Manager';
    else if (role === 'admin') senderName = 'System Admin';
    if (isTech || role === 'employee' || role === 'team_lead') {
      senderName = userProfile?.fullName || senderName;
    }

    setSendingReply(true);
    try {
      let attachmentFields: { attachmentName?: string; attachmentUrl?: string; attachmentSize?: number } = {};
      if (replyFile) {
        const { data, error } = await fileToStoredAttachment(replyFile);
        if (error) { setReplyFileError(error); return; }
        attachmentFields = { attachmentName: replyFile.name, attachmentUrl: data, attachmentSize: replyFile.size };
      }

      await hrActions.addTicketReply(selectedTicket, {
        senderName,
        senderRole: role,
        senderEmail: currentEmail,
        message: replyMsg.trim(),
        ...attachmentFields,
      });

      refetchTickets();
      setReplyMsg('');
      setReplyFile(null);
      lastTypingTouchRef.current = 0;
      hrActions.clearTypingState('ticket', selectedTicket.id, currentEmail).catch(() => {});
    } catch (err) {
      // Same fix as handleOpenTicket above — fileToStoredAttachment can now
      // throw instead of silently succeeding with unusable data.
      console.error('[Tickets] Failed to send reply:', err);
      setReplyFileError(err instanceof Error ? err.message : 'Failed to attach this file. Please try again.');
    } finally {
      setSendingReply(false);
    }
  };

  // Touches the typing marker at most once every 1.5s while there's text in
  // the reply box; clears it immediately once emptied. Same debounce
  // approach as TeamChatView's composer.
  const handleReplyMsgChange = (value: string) => {
    setReplyMsg(value);
    if (!selectedTicket || !currentEmail) return;
    const ticketId = selectedTicket.id;
    if (value.trim()) {
      const now = Date.now();
      if (now - lastTypingTouchRef.current > 1500) {
        lastTypingTouchRef.current = now;
        const displayNameForTyping = userProfile?.fullName || currentEmail;
        hrActions.touchTypingState('ticket', ticketId, currentEmail, displayNameForTyping).catch(() => {});
      }
    } else {
      lastTypingTouchRef.current = 0;
      hrActions.clearTypingState('ticket', ticketId, currentEmail).catch(() => {});
    }
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    sendReply();
  };

  const [pendingTicketStatusAction, setPendingTicketStatusAction] = useState<{ id: string; action: 'closed' | 'open' } | null>(null);

  const handleCloseTicket = (id: string) => {
    if (updatingTicketStatusId) return;
    setPendingTicketStatusAction({ id, action: 'closed' });
  };

  const handleReopenTicket = (id: string) => {
    if (updatingTicketStatusId) return;
    setPendingTicketStatusAction({ id, action: 'open' });
  };

  const confirmTicketStatusChange = async () => {
    if (!pendingTicketStatusAction) return;
    const { id, action } = pendingTicketStatusAction;
    setPendingTicketStatusAction(null);
    const ticket = tickets.find(t => t.id === id) || selectedTicket;
    if (!ticket) return;
    setUpdatingTicketStatusId(id);
    try {
      await hrActions.updateTicketStatus(ticket, action, { name: userProfile?.fullName || (role === 'hr' ? 'HR' : role === 'admin' ? 'Admin' : 'Employee'), role, email: currentEmail });
      refetchTickets();
    } finally {
      setUpdatingTicketStatusId(null);
    }
  };

  const handleInspectApplicant = (email: string) => {
    const p = employees.find(e => e.email && email && e.email.toLowerCase() === email.toLowerCase());
    if (p) setInspectEmployee(p);
  };

  const isClosed = selectedTicket?.status === 'closed';
  const isAdmin = role === 'admin';
  const isEmp = role === 'employee' || role === 'team_lead';
  // An employee can close (but not re-open) a ticket they filed themselves —
  // e.g. once their issue is resolved, without waiting on HR/Technical to
  // do it. Re-opening stays privileged-only: if it turns out not actually
  // resolved, replying (which flips a closed ticket's unread state for
  // HR/Technical the same as any other message) is the expected path,
  // rather than letting anyone silently reopen their own closed cases.
  const isOwnTicket = !!selectedTicket && !!currentEmail && selectedTicket.employeeEmail.toLowerCase() === currentEmail.toLowerCase();
  const canCloseOwnTicket = isEmp && isOwnTicket && !isPrivileged;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Support Help Desk</h1>
          <p className="text-slate-500 text-sm">Open support cases, seek assistance, and view ticket logs.</p>
        </div>
        {isEmp && (
          <Button
            variant="primary"
            size="md"
            onClick={() => setIsNewOpen(true)}
          >
            <Plus className="h-4.5 w-4.5" /> File a Ticket
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Tickets List */}
        <div className={`lg:col-span-5 space-y-3 ${selectedTicket ? 'hidden lg:block' : 'block'}`}>
          {/* Tab Switcher for Technical Team members */}
          {isTechnicalTeam && role !== 'admin' && (
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewTab('assigned')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  viewTab === 'assigned'
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Headset className="h-3.5 w-3.5" /> Support Queue
              </button>
              <button
                type="button"
                onClick={() => setViewTab('my_tickets')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  viewTab === 'my_tickets'
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <User className="h-3.5 w-3.5" /> My Tickets
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
              Tickets ({visibleTickets.length}{visibleTickets.length !== tickets.length ? ` of ${tickets.length}` : ''})
            </h3>
          </div>

          {/* Filters — status pill group + free-text search. Sits above the
              scrollable list, not inside it, so it stays visible/reachable
              regardless of scroll position. */}
          <div className="space-y-2">
            <SearchInput fieldSize="sm" value={searchQuery} onChange={setSearchQuery} placeholder={isPrivileged ? 'Search by title, employee, or details…' : 'Search your tickets…'} />
            <div className="flex items-center justify-between gap-1.5 flex-wrap">
              <div className="flex items-center gap-1.5">
                {(['all', 'open', 'closed'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setStatusFilter(f)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      statusFilter === f
                        ? 'bg-orange-600 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'open' ? 'Open' : 'Closed'}
                  </button>
                ))}
              </div>

              {isAdmin && (
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-full border border-slate-200">
                  {(['all', 'hr', 'technical'] as const).map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDeptFilter(d)}
                      className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider transition-colors ${
                        deptFilter === d
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {d === 'all' ? 'All Depts' : d === 'hr' ? 'HR' : 'Tech'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <TicketListPanel visibleTickets={visibleTickets} selectedTicket={selectedTicket} setSelectedTicket={setSelectedTicket} isEmp={isEmp} isTicketLiveWithHR={isTicketLiveWithHR} canForwardToHrAdmin={canForwardToHrAdmin} setForwardingTicket={setForwardingTicket} setForwardNote={setForwardNote} setForwardError={setForwardError} nameFor={nameFor} currentEmail={currentEmail} ticketsLoading={ticketsLoading} tickets={tickets} setStatusFilter={setStatusFilter} setSearchQuery={setSearchQuery} allTickets={allTickets} ticketLimit={ticketLimit} setTicketLimit={setTicketLimit} isFetchingTickets={isFetchingTickets} />
        </div>

        {/* Conversation Chat Panel. Fixed full-screen overlay on mobile.
            `paddingBottom={keyboardHeight}` (from useNativeKeyboard) lifts
            the inner flex content above the native keyboard: the chat log
            (flex-1 overflow-y-auto) shrinks to absorb the padding while the
            header and reply bar stay at their natural sizes. The layout
            layout.tsx switches <main> to overflow-hidden while this panel is
            open (via isTicketPanelOpen + useAnyModalOpen) so the background
            page doesn't scroll/pan under the panel when the keyboard opens. */}
        <TicketConversationPanel selectedTicket={selectedTicket} keyboardHeight={keyboardHeight} setSelectedTicket={setSelectedTicket} isEmp={isEmp} isTicketLiveWithHR={isTicketLiveWithHR} isPrivileged={isPrivileged} canCloseOwnTicket={canCloseOwnTicket} isClosed={isClosed} handleCloseTicket={handleCloseTicket} updatingTicketStatusId={updatingTicketStatusId} handleReopenTicket={handleReopenTicket} canForwardToHrAdmin={canForwardToHrAdmin} setForwardingTicket={setForwardingTicket} setForwardNote={setForwardNote} setForwardError={setForwardError} handleInspectApplicant={handleInspectApplicant} nameFor={nameFor} currentEmail={currentEmail} userProfile={userProfile} profileFor={profileFor} role={role} ticketSeenState={ticketSeenState} setLightboxSrc={setLightboxSrc} setLightboxName={setLightboxName} typingNames={typingNames} chatEndRef={chatEndRef} isAdmin={isAdmin} handleSendReply={handleSendReply} replyFileError={replyFileError} replyFile={replyFile} setReplyFile={setReplyFile} replyFileInputRef={replyFileInputRef} handleReplyFileChange={handleReplyFileChange} replyTextareaRef={replyTextareaRef} replyMsg={replyMsg} handleReplyMsgChange={handleReplyMsgChange} sendReply={sendReply} sendingReply={sendingReply} />
      </div>

      {/* New ticket modal */}
      <Modal isOpen={isNewOpen} onClose={() => { setIsNewOpen(false); setNewTicketFile(null); setNewTicketFileError(''); }} title="File Support Ticket">
        <form onSubmit={handleOpenTicket} className="space-y-4">
          <FormField label="Department *" size="md">
            <Select required value={department} onChange={e => setDepartment(e.target.value as 'hr' | 'technical')} fieldSize="md" className="appearance-none">
              <option value="hr">Human Resources</option>
              <option value="technical">Technical Team</option>
            </Select>
          </FormField>

          <FormField label="Ticket Title / Topic *" size="md">
            <Input type="text" required value={title} onChange={e => setTitle(e.target.value)} fieldSize="md" placeholder="e.g. Salary discrepancy / System access issues" />
          </FormField>

          <FormField label="Describe the Problem *" size="md">
            <Textarea required rows={4} value={desc} onChange={e => setDesc(e.target.value)} fieldSize="md" className="resize-none" placeholder="Explain the situation in details so HR can assist you..." />
          </FormField>

          <FormField label="Attachment (optional)" size="md">
            {newTicketFileError && (
              <div className="p-2 text-[10px] bg-rose-50 text-rose-600 border border-rose-100 rounded-lg font-semibold flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />{newTicketFileError}
              </div>
            )}
            {newTicketFile ? (
              <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600">
                <span className="flex items-center gap-1.5 truncate"><FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" /> {newTicketFile.name}</span>
                <button type="button" onClick={() => setNewTicketFile(null)} className="text-slate-400 hover:text-rose-600 shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => newTicketFileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-600 px-3 py-2.5 rounded-lg transition-colors transition-transform border border-dashed border-slate-300 active:scale-97"
              >
                <Paperclip className="h-3.5 w-3.5" /> Attach a screenshot or document
              </button>
            )}
            <input ref={newTicketFileInputRef} type="file" accept="image/*,application/pdf" onChange={handleNewTicketFileChange} className="hidden" />
          </FormField>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" size="md" disabled={isOpeningTicket} onClick={() => { setIsNewOpen(false); setNewTicketFile(null); setNewTicketFileError(''); }}>Cancel</Button>
            <Button type="submit" disabled={isOpeningTicket}  size="lg">
              {isOpeningTicket && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isOpeningTicket ? 'Filing…' : 'File Ticket'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Inspect employee profile modal */}
      {inspectEmployee && (
        <Modal isOpen={true} onClose={() => setInspectEmployee(null)} title="Employee Profile Inspector">
          <div className="space-y-4">
            <div className="flex items-center gap-4 bg-slate-50 p-4 border border-slate-200 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  if (!isPrivileged || !inspectEmployee.profilePicture) return;
                  setLightboxSrc(inspectEmployee.profilePicture);
                  setLightboxName(`${inspectEmployee.fullName}.jpg`);
                }}
                title={isPrivileged && inspectEmployee.profilePicture ? 'View full size' : undefined}
                className={isPrivileged && inspectEmployee.profilePicture ? 'cursor-zoom-in' : 'cursor-default'}
              >
                <Avatar src={inspectEmployee.profilePicture} name={inspectEmployee.fullName} size={48} />
              </button>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">{isPrivileged ? displayName(inspectEmployee, role as 'hr' | 'admin') : inspectEmployee.fullName}</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{inspectEmployee.jobTitle || inspectEmployee.role}</p>
              </div>
            </div>

            <div className="space-y-2.5 divide-y divide-slate-100 text-xs font-semibold">
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-400 uppercase text-[9px] tracking-wider">Email Address</span>
                <span className="text-slate-800 font-medium">{inspectEmployee.email}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-400 uppercase text-[9px] tracking-wider">Department Teams</span>
                <span className="text-slate-800">{inspectEmployee.teams.join(', ') || 'No Team'}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-400 uppercase text-[9px] tracking-wider">Service Start Date</span>
                <span className="text-slate-800">{formatDateNY(inspectEmployee.joinedDate)}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-400 uppercase text-[9px] tracking-wider">Gender</span>
                <span className="text-slate-800 capitalize">{inspectEmployee.gender || 'male'}</span>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-200">
              <Button variant="secondary" size="md" onClick={() => setInspectEmployee(null)}>
                Close Inspector
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ImageLightbox
        src={lightboxSrc}
        alt={lightboxName}
        downloadName={lightboxName}
        onClose={() => { setLightboxSrc(null); setLightboxName(undefined); }}
      />

      {/* Forward-to-HR-&-Admin modal — same note-composer + preview shape
          as TeamChatView's forward modal and the announcement panels'
          (see hrActions.forwardToHrAdminLine in hrData.ts for the one
          shared mechanism behind all 3). Note is optional. */}
      <Modal
        isOpen={!!forwardingTicket}
        onClose={() => { if (!isForwarding) { setForwardingTicket(null); setForwardNote(''); setForwardError(''); } }}
        title="Forward to HR & Admin"
      >
        {forwardingTicket && (
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Ticket</p>
              <p className="text-xs font-bold text-slate-800 break-words">{forwardingTicket.title}</p>
              <p className="text-xs text-slate-500 mt-1 line-clamp-3 break-words">{forwardingTicket.description}</p>
            </div>
            <FormField label="Note (optional)">
              <Textarea
                value={forwardNote}
                onChange={e => setForwardNote(e.target.value)}
                rows={2}
                placeholder="Add a note for HR & Admin…"
                fieldSize="md" className="resize-none"
              />
            </FormField>
            {forwardError && <p className="text-xs font-semibold text-rose-600">{forwardError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="md"
                disabled={isForwarding}
                onClick={() => { setForwardingTicket(null); setForwardNote(''); setForwardError(''); }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={isForwarding}
                onClick={submitTicketForward}
              >
                {isForwarding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isForwarding ? 'Forwarding…' : 'Forward'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={pendingTicketStatusAction !== null}
        onClose={() => setPendingTicketStatusAction(null)}
        onConfirm={confirmTicketStatusChange}
        title={pendingTicketStatusAction?.action === 'closed' ? 'Close this ticket?' : 'Re-open this ticket?'}
        message={pendingTicketStatusAction?.action === 'closed'
          ? 'Are you sure you want to mark this support ticket as closed?'
          : 'Are you sure you want to re-open this ticket?'}
        confirmLabel={updatingTicketStatusId ? 'Saving…' : (pendingTicketStatusAction?.action === 'closed' ? 'Close Ticket' : 'Re-open')}
        variant="warning"
        loading={!!updatingTicketStatusId}
      />
    </div>
  );
}
