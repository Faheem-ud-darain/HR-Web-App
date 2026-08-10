'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useProfiles, useTickets, hrActions, Ticket, TicketPresence, TicketSeenState, Profile, markTicketActivitySeen, displayName, isTechnicalSupportMember } from '@/lib/hrData';
import { TypingIndicator } from './TypingIndicator';
import { getSessionEmail } from '@/lib/session';
import { compressImageToWebP, validatePdfSize, fileToDataUrl, MAX_DOCUMENT_IMAGE_BYTES } from '@/lib/imageCompressor';
import { HelpCircle, Plus, Send, Lock, RotateCcw, User, Mail, Calendar, Briefcase, Users, Eye, CheckCircle2, AlertCircle, Paperclip, X, FileText, Download, Headset, Loader2, ArrowLeft, Search } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { formatDateTimeNY, formatDateNY } from '@/lib/timezone';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { pushModal, popModal } from '@/lib/modalStack';
import { isNativeMobileApp } from '@/lib/trackerSetup';
import { useNativeKeyboard } from '@/hooks/useNativeKeyboard';

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

function isImageAttachment(name?: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name || '');
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
const BARE_TIME_ONLY = /^\d{1,2}:\d{2}\s*[AP]M$/i;

function formatTicketDate(raw: string): string {
  if (BARE_TIME_ONLY.test(raw.trim())) return raw; // legacy format, no date was ever recorded — don't guess one
  const d = new Date(raw.replace(' ', 'T'));
  if (isNaN(d.getTime())) return raw; // fall back to the raw string rather than showing "Invalid Date"
  return formatDateTimeNY(d);
}

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
function ticketActivityMs(ticket: Ticket): number {
  let latest = Date.parse(ticket.createdAt.replace(' ', 'T'));
  if (isNaN(latest)) latest = 0;
  for (const rep of ticket.replies) {
    if (BARE_TIME_ONLY.test(rep.timestamp.trim())) continue;
    const t = Date.parse(rep.timestamp);
    if (!isNaN(t) && t > latest) latest = t;
  }
  return latest;
}

interface TicketsViewProps {
  role: 'admin' | 'hr' | 'employee' | 'team_lead';
}

export function TicketsView({ role }: TicketsViewProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [currentEmail, setCurrentEmail] = useState('');
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

  // On mobile, an open ticket becomes a fixed full-screen overlay (see the
  // `selectedTicket ? '... fixed inset-x-0 top-0 bottom-[64px] ...'` panel
  // below) — visually it IS a full-screen modal, so it should hide the
  // floating bottom pill nav the same way any other modal does (via
  // modalStack), rather than hiding the nav for the whole /tickets route
  // (which incorrectly hid it on the ticket list too, before any ticket
  // was open).
  useEffect(() => {
    if (selectedTicket) {
      pushModal();
      return () => popModal();
    }
  }, [!!selectedTicket]);

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

  // Ticket list filters — status pill + free-text search (title, employee
  // name/alias, description). Kept separate from `tickets` itself (the
  // role-scoped set from applyTickets) so switching a filter never needs a
  // refetch, and so the "no tickets match your filters" empty state can be
  // told apart from "there are genuinely zero tickets".
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [deptFilter, setDeptFilter] = useState<'all' | 'hr' | 'technical'>('all');
  const [viewTab, setViewTab] = useState<'assigned' | 'my_tickets'>('assigned');
  const [searchQuery, setSearchQuery] = useState('');

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
  }, [tickets, statusFilter, deptFilter, viewTab, searchQuery, employees, isPrivileged, isTechnicalTeam, currentEmail, role]);

  // Form states
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [replyMsg, setReplyMsg] = useState('');
  const [success, setSuccess] = useState('');

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
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const lastTypingTouchRef = useRef<number>(0);

  // Deep-linking from a notification click (?ticketId=...) — see the effect
  // below applyTickets. Applied at most once per page load: after the first
  // successful auto-select, the ref flips so a later poll refresh (or the
  // user picking a different ticket) doesn't keep forcing this one back
  // open. Deliberately reads window.location.search directly with
  // URLSearchParams instead of next/navigation's useSearchParams — that
  // hook requires a Suspense boundary under this app's static export build
  // (see auth/page.tsx's comment for the same tradeoff made there), which
  // isn't worth adding just for a one-shot read on mount.
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
          // Strip the query param so it doesn't re-apply on a manual
          // refresh after the user has since switched to a different
          // ticket, and so the URL doesn't stay pinned to this one ticket.
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    }
  };

  const { data: allProfiles, refetch: refetchProfiles } = useProfiles();
  const { data: allTickets, refetch: refetchTickets } = useTickets();

  useEffect(() => {
    const email = getSessionEmail() || '';
    setCurrentEmail(email);
    
    let currentProfile = userProfile;
    if (allProfiles) {
      setEmployees(allProfiles);
      currentProfile = allProfiles.find(e => e.email && email && e.email.toLowerCase() === email.toLowerCase()) || null;
      setUserProfile(currentProfile);
    }

    if (allTickets) {
      applyTickets(allTickets, email, currentProfile);
      // Viewing this page clears the sidebar's unseen-activity dot for this
      // role+email. Re-runs on every poll while the page stays open, so new
      // activity that arrives elsewhere still lights the dot back up later.
      markTicketActivitySeen(allTickets, role, email);
    }
  }, [role, allProfiles, allTickets]);

  // Scroll chat to bottom when replies change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedTicket?.replies, typingNames.length]);

  // Best-effort sweep for attachments on tickets closed 15+ days ago — see
  // checkTicketAttachmentRetention in hrData.ts. There's no server cron in
  // this app, so this only runs when someone actually opens the Tickets
  // page (same pattern as checkScreenshotRetention elsewhere); a 15-day
  // window doesn't need a tight polling interval, so this just runs once
  // per page visit and refetches so a just-scrubbed attachment disappears
  // from view immediately.
  useEffect(() => {
    hrActions.checkTicketAttachmentRetention().then(() => refetchTickets());
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
  }, [role, selectedTicket?.id, selectedTicket?.status, currentEmail]);

  // Employee/team-lead side: poll every ticket's live presence so the
  // conversation panel (and the ticket list) can show a "Live — HR is
  // chatting" badge. Cheap best-effort polling (no realtime channel in this
  // app — see TicketPresence's doc comment).
  const [ticketPresences, setTicketPresences] = useState<TicketPresence[]>([]);
  useEffect(() => {
    if (role !== 'employee' && role !== 'team_lead') return;
    let cancelled = false;
    const poll = async () => {
      const all = await hrActions.getAllTicketPresences();
      if (!cancelled) setTicketPresences(all);
    };
    poll();
    const interval = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [role]);

  const isTicketLiveWithHR = (ticketId: string): boolean => {
    const presence = ticketPresences.find(entry => entry.ticketId === ticketId && entry.role === 'hr');
    return hrActions.isTicketPresenceLive(presence);
  };

  // Employee/team-lead side: mark this ticket "seen as of now" while it's
  // open, so HR/Admin can tell a reply was actually read (see
  // TicketSeenState in hrData.ts). Re-touched on an interval — not just
  // once on open — so it also advances past a reply that arrives while
  // this ticket is already sitting open on screen. Unlike TicketPresence
  // above, this is a durable marker: no cleanup/clear on unmount, since
  // "last seen at this time" should stay true after the employee leaves.
  useEffect(() => {
    if ((role !== 'employee' && role !== 'team_lead') || !selectedTicket) return;
    const ticketId = selectedTicket.id;
    const touch = () => hrActions.touchTicketSeenByEmployee(ticketId);
    touch();
    const interval = setInterval(touch, 8000);
    return () => clearInterval(interval);
  }, [role, selectedTicket?.id, selectedTicket?.replies.length]);

  // HR/Admin side: poll the currently-open ticket's seen state so a "Seen"
  // label can appear under HR's last message once the employee has
  // actually read it, without needing a manual refresh.
  const [ticketSeenState, setTicketSeenState] = useState<TicketSeenState | null>(null);
  useEffect(() => {
    if (!isPrivileged || !selectedTicket) { setTicketSeenState(null); return; }
    const ticketId = selectedTicket.id;
    let cancelled = false;
    const poll = async () => {
      const state = await hrActions.getTicketSeenState(ticketId);
      if (!cancelled) setTicketSeenState(state);
    };
    poll();
    const interval = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isPrivileged, selectedTicket?.id]);

  // "X is typing…" — poll the other side's typing state for the currently
  // open ticket every 2s. Symmetric: both HR and the employee/team_lead can
  // reply, so both sides run this same poll+clear-on-unmount effect, scoped
  // per ticket like TicketPresence/TicketSeenState above. Admin is excluded
  // — replies are disabled for Admin (read-only), so there's nothing for
  // them to ever be typing.
  useEffect(() => {
    setTypingNames([]);
    if (role === 'admin' || !selectedTicket || selectedTicket.status === 'closed' || !currentEmail) return;
    const ticketId = selectedTicket.id;
    let cancelled = false;
    const poll = () => {
      hrActions.getTypingUsers('ticket', ticketId, currentEmail).then(rows => {
        if (!cancelled) setTypingNames(rows.map(r => r.displayName));
      }).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      hrActions.clearTypingState('ticket', ticketId, currentEmail).catch(() => {});
    };
  }, [role, selectedTicket?.id, selectedTicket?.status, currentEmail]);

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
      setSuccess('Support ticket opened successfully!');
      setTimeout(() => {
        setIsNewOpen(false);
        setTitle('');
        setDesc('');
        setDepartment('hr');
        setNewTicketFile(null);
        setSuccess('');
      }, 1200);
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

  const handleCloseTicket = async (id: string) => {
    if (updatingTicketStatusId) return;
    if (!window.confirm('Are you sure you want to mark this support ticket as closed?')) return;
    const ticket = tickets.find(t => t.id === id) || selectedTicket;
    if (!ticket) return;
    setUpdatingTicketStatusId(id);
    try {
      await hrActions.updateTicketStatus(ticket, 'closed');
      refetchTickets();
    } finally {
      setUpdatingTicketStatusId(null);
    }
  };

  const handleReopenTicket = async (id: string) => {
    if (updatingTicketStatusId) return;
    if (!window.confirm('Are you sure you want to re-open this ticket?')) return;
    const ticket = tickets.find(t => t.id === id) || selectedTicket;
    if (!ticket) return;
    setUpdatingTicketStatusId(id);
    try {
      await hrActions.updateTicketStatus(ticket, 'open');
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
  const isHR = role === 'hr';
  const isEmp = role === 'employee' || role === 'team_lead';

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Support Help Desk</h1>
          <p className="text-slate-500 text-sm">Open support cases, seek assistance, and view ticket logs.</p>
        </div>
        {isEmp && (
          <button
            onClick={() => setIsNewOpen(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="h-4.5 w-4.5" /> File a Ticket
          </button>
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
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={isPrivileged ? 'Search by title, employee, or details…' : 'Search your tickets…'}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-orange-500 placeholder:text-slate-400"
              />
            </div>
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

          <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
            {visibleTickets.map(t => {
              const active = selectedTicket?.id === t.id;
              return (
                <Card
                  key={t.id}
                  onClick={() => setSelectedTicket(t)}
                  className={`border transition-colors cursor-pointer p-4 ${
                    active ? 'border-orange-500 bg-orange-50/20' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="font-bold text-slate-900 text-sm line-clamp-1 flex items-center gap-1.5">
                      {t.title}
                      {isEmp && isTicketLiveWithHR(t.id) && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full shrink-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border uppercase ${
                        t.department === 'technical'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-purple-50 text-purple-700 border-purple-200'
                      }`}>
                        {t.department === 'technical' ? 'Tech' : 'HR'}
                      </span>
                      <Badge variant={t.status === 'open' ? 'warning' : 'success'}>
                        {t.status === 'open' ? 'Open' : 'Closed'}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-1 mb-2">{t.description}</p>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" /> {nameFor(t.employeeName)}
                      {t.employeeEmail.toLowerCase() === (currentEmail || '').toLowerCase() && (
                        <span className="text-[9px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-1 rounded">You</span>
                      )}
                    </span>
                    <span>{formatTicketDate(t.createdAt)}</span>
                  </div>
                </Card>
              );
            })}
            {visibleTickets.length === 0 && tickets.length === 0 && (
              <div className="text-center py-12 text-slate-400 font-semibold italic text-xs border border-dashed border-slate-200 rounded-xl bg-white">
                No tickets listed.
              </div>
            )}
            {visibleTickets.length === 0 && tickets.length > 0 && (
              <div className="text-center py-12 text-slate-400 font-semibold text-xs border border-dashed border-slate-200 rounded-xl bg-white space-y-2">
                <p className="italic">No tickets match your filters.</p>
                <button
                  type="button"
                  onClick={() => { setStatusFilter('all'); setSearchQuery(''); }}
                  className="text-orange-600 hover:text-orange-700 font-bold underline not-italic"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Conversation Chat Panel. Fixed full-screen overlay on mobile.
            `paddingBottom={keyboardHeight}` (from useNativeKeyboard) lifts
            the inner flex content above the native keyboard: the chat log
            (flex-1 overflow-y-auto) shrinks to absorb the padding while the
            header and reply bar stay at their natural sizes. The layout
            layout.tsx switches <main> to overflow-hidden while this panel is
            open (via isTicketPanelOpen + useAnyModalOpen) so the background
            page doesn't scroll/pan under the panel when the keyboard opens. */}
        <div
          className={`lg:col-span-7 ${!selectedTicket ? 'hidden lg:block' : 'block fixed inset-0 z-40 bg-white lg:static lg:z-auto lg:bg-transparent'}`}
          style={selectedTicket && keyboardHeight > 0 ? { paddingBottom: keyboardHeight } : undefined}
        >
          {selectedTicket ? (
            <div className="border-0 lg:border border-slate-200 overflow-hidden flex flex-col h-full lg:h-[calc(100vh-220px)] min-h-[560px] lg:rounded-xl bg-white">
              {/* Header. Arbitrary-value pt (not `py-2.5 lg:py-4 pt-safe`
                  combined) — this file's own globals.css comment warns that
                  a bare .pt-safe/.pb-safe class stacked with a Tailwind
                  padding shorthand touching the same side is a same-
                  specificity cascade collision that can silently compile
                  away to nothing. This panel is `fixed inset-x-0 top-0` on
                  mobile (see the wrapping div above), which on notched/
                  Dynamic-Island iPhones put the ticket title under the
                  status bar with no way to tap "back" — and on Android,
                  with zero top inset to add, it needs the same 12px
                  minimum floor .pt-safe now gives everywhere else. Both
                  env() and the pb-2.5/lg:pb-4 base are folded into one
                  calc() per breakpoint instead. */}
              <div className="px-3.5 lg:px-5 pt-[max(20px,env(safe-area-inset-top))] pb-2.5 lg:pb-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 md:gap-4">
                {/* `grow` (flex-grow only) instead of `flex-1` — flex-1 sets
                    the `flex` shorthand (flex: 1 1 0%), which stomps on
                    basis-full's flex-basis: 100% depending on Tailwind's
                    generated stylesheet order (same same-property cascade
                    collision as the pt-safe/pb-safe bug — see globals.css).
                    That silently kept this block from actually taking the
                    full row width on mobile, so it never wrapped onto its
                    own line and the Operations button got squeezed onto
                    the same row instead of the row below it. */}
                {/* items-center (not items-start on mobile) — vertically
                    centers the back button against the full two-line
                    title + "Opened by" block, not just top-aligned with
                    the title's line alone. */}
                <div className="flex items-center gap-2 grow min-w-0">
                  {/* No background box, matching TopNav's chat-screen back
                      button (TopNav.tsx) — just an icon, not a filled pill. */}
                  <button onClick={() => setSelectedTicket(null)} className="lg:hidden h-8 w-8 shrink-0 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors">
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    {/* Title row + Operations now share one row (previously
                        Operations was a separate div pushed onto its own
                        wrapped flex line via ml-auto — which visually read
                        as "floating, disconnected from the title" rather
                        than inline with it). justify-between here does the
                        right-alignment instead. */}
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 truncate min-w-0">
                        <span className="truncate">{selectedTicket.title}</span>
                        {isEmp && isTicketLiveWithHR(selectedTicket.id) && (
                          <span className="inline-flex shrink-0 items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <Headset className="h-3 w-3" /> Live
                          </span>
                        )}
                      </h3>
                      <div className="flex items-center gap-2 shrink-0">
                        {isPrivileged && !isClosed && (
                          <button
                            onClick={() => handleCloseTicket(selectedTicket.id)}
                            disabled={updatingTicketStatusId === selectedTicket.id}
                            title="Close Ticket"
                            className="h-8 w-8 lg:w-auto lg:px-3 lg:py-1.5 text-xs font-semibold bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 rounded-lg active:scale-97 transition-colors transition-transform flex items-center justify-center gap-1 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {updatingTicketStatusId === selectedTicket.id ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : <Lock className="h-3.5 w-3.5 shrink-0" />}
                            <span className="hidden lg:inline">Close Ticket</span>
                          </button>
                        )}
                        {isPrivileged && isClosed && (
                          <button
                            onClick={() => handleReopenTicket(selectedTicket.id)}
                            disabled={updatingTicketStatusId === selectedTicket.id}
                            title="Re-open Ticket"
                            className="h-8 w-8 lg:w-auto lg:px-3 lg:py-1.5 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg active:scale-97 transition-colors transition-transform flex items-center justify-center gap-1 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {updatingTicketStatusId === selectedTicket.id ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : <RotateCcw className="h-3.5 w-3.5 shrink-0" />}
                            <span className="hidden lg:inline">Re-open Ticket</span>
                          </button>
                        )}
                        {isClosed && !isPrivileged && (
                          <span className="text-[10px] font-bold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                            <Lock className="h-3 w-3" /> Closed
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-600 font-bold mt-0.5 flex items-center gap-1.5 min-w-0">
                      <span className="shrink-0 whitespace-nowrap">Opened by:</span>
                      <button
                        onClick={() => handleInspectApplicant(selectedTicket.employeeEmail)}
                        className="text-orange-700 hover:underline flex items-center gap-0.5 min-w-0"
                      >
                        <span className="truncate min-w-0">{nameFor(selectedTicket.employeeName)}</span>
                        <Eye className="h-3 w-3 shrink-0" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chat replies log */}
              <div className="flex-1 min-h-0 p-5 space-y-4 overflow-y-auto bg-slate-50/30">
                {/* Employee Description */}
                {(() => {
                  const isAuthorSelf = Boolean(
                    (currentEmail && selectedTicket.employeeEmail && selectedTicket.employeeEmail.toLowerCase() === currentEmail.toLowerCase()) ||
                    (userProfile?.fullName && selectedTicket.employeeName && selectedTicket.employeeName.trim().toLowerCase() === userProfile.fullName.trim().toLowerCase()) ||
                    (userProfile?.email && selectedTicket.employeeEmail && selectedTicket.employeeEmail.toLowerCase() === userProfile.email.toLowerCase())
                  );
                  return (
                    <div className={`flex items-start gap-2.5 max-w-[85%] ${isAuthorSelf ? 'ml-auto flex-row-reverse' : ''}`}>
                      <Avatar src={profileFor(selectedTicket.employeeName)?.profilePicture} name={selectedTicket.employeeName} size={28} className="flex-shrink-0" />
                      <div className={`rounded-2xl p-3 shadow-sm text-xs ${
                        isAuthorSelf 
                          ? 'bg-orange-600 text-white rounded-tr-none' 
                          : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                      }`}>
                        <p className={`font-bold text-[10px] mb-0.5 ${isAuthorSelf ? 'text-orange-200' : 'text-slate-500'}`}>
                          {nameFor(selectedTicket.employeeName)} (Author)
                        </p>
                        <p className="font-medium leading-relaxed whitespace-pre-wrap break-words">{selectedTicket.description}</p>
                        <span className={`block text-[9px] mt-1 text-right ${isAuthorSelf ? 'text-orange-200' : 'text-slate-400'}`}>
                          {formatTicketDate(selectedTicket.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Replies list */}
                {selectedTicket.replies.map((rep, repIdx) => {
                  let isSenderSelf = false;

                  // 1. Direct email match if available
                  if (rep.senderEmail && currentEmail && rep.senderEmail.toLowerCase() === currentEmail.toLowerCase()) {
                    isSenderSelf = true;
                  }
                  // 2. HR role viewing an HR sender reply
                  else if (role === 'hr' && rep.senderRole === 'hr') {
                    isSenderSelf = true;
                  }
                  // 3. Admin role viewing an Admin sender reply
                  else if (role === 'admin' && rep.senderRole === 'admin') {
                    isSenderSelf = true;
                  }
                  // 4. Name matching for employees / tech team / profile matches
                  else if (userProfile?.fullName && rep.senderName) {
                    const normSender = rep.senderName.trim().toLowerCase();
                    const normProfile = userProfile.fullName.trim().toLowerCase();
                    isSenderSelf = normSender === normProfile || normSender.startsWith(normProfile) || normProfile.startsWith(normSender);
                  }
                  // 5. Email prefix matching fallback
                  else if (currentEmail && rep.senderName && rep.senderName.trim().toLowerCase().includes(currentEmail.split('@')[0].toLowerCase())) {
                    isSenderSelf = true;
                  }

                  // "Seen" only ever shows under the single most recent
                  // HR reply, same one-badge-at-a-time convention as most
                  // chat apps (not one per message) — and only to HR/Admin,
                  // since they're the ones who actually want to know
                  // whether the employee has caught up.
                  const isLastReply = repIdx === selectedTicket.replies.length - 1;
                  const showSeen =
                    isLastReply &&
                    isPrivileged &&
                    rep.senderRole === 'hr' &&
                    !!ticketSeenState?.employeeSeenAt &&
                    new Date(ticketSeenState.employeeSeenAt).getTime() >= new Date(rep.timestamp).getTime();

                  const isAdminViewer = role === 'admin';
                  const isHrSender = rep.senderRole === 'hr';

                  return (
                    <div 
                      key={rep.id} 
                      className={`flex items-start gap-2.5 max-w-[85%] ${
                        isSenderSelf ? 'ml-auto flex-row-reverse' : ''
                      }`}
                    >
                      <Avatar src={profileFor(rep.senderName)?.profilePicture} name={rep.senderName} size={28} className="flex-shrink-0" />
                      {/* Column wrapper so "Seen" can sit below/outside the
                          bubble instead of being one more line inside its
                          padding+background — same idea as WhatsApp/iMessage
                          read receipts, which render underneath the bubble,
                          not inside it. */}
                      <div className="flex flex-col min-w-0">
                        <div className={`rounded-2xl p-3 shadow-sm text-xs ${
                          isSenderSelf
                            ? 'bg-orange-600 text-white rounded-tr-none'
                            : isAdminViewer && isHrSender
                              ? 'bg-orange-50/80 border-2 border-orange-300/80 text-slate-800 rounded-tl-none shadow-orange-100/50'
                              : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                        }`}>
                          <p className={`font-bold text-[10px] mb-0.5 ${
                            isSenderSelf
                              ? 'text-orange-200'
                              : isAdminViewer && isHrSender
                                ? 'text-orange-800'
                                : 'text-slate-600'
                          }`}>
                            {nameFor(rep.senderName)} ({rep.senderRole.toUpperCase()}) {isAdminViewer && isHrSender && '★'}
                          </p>
                          {rep.message && <p className="font-medium leading-relaxed whitespace-pre-wrap break-words">{rep.message}</p>}
                          {rep.attachmentUrl && (
                            isImageAttachment(rep.attachmentName) ? (
                              // Opens in the in-app lightbox instead of
                              // <a target="_blank"> — that used to hand the
                              // base64 data: URL off to an external browser
                              // intent, which on Android/Capacitor either
                              // fails silently or opens a blank tab, since
                              // there's no real document to navigate to.
                              <button
                                type="button"
                                onClick={() => { setLightboxSrc(rep.attachmentUrl!); setLightboxName(rep.attachmentName); }}
                                className={rep.message ? 'block mt-2' : 'block'}
                              >
                                <img src={rep.attachmentUrl} alt={rep.attachmentName || 'attachment'} className="rounded-lg max-h-56 object-cover" />
                              </button>
                            ) : (
                              <a
                                href={rep.attachmentUrl}
                                download={rep.attachmentName}
                                className={`flex items-center gap-1.5 text-[11px] font-bold underline ${rep.message ? 'mt-2' : ''} ${isSenderSelf ? 'text-orange-100' : 'text-amber-700'}`}
                              >
                                <FileText className="h-3.5 w-3.5 shrink-0" /> {rep.attachmentName || 'Attachment'}
                                {rep.attachmentSize !== undefined && <span className="font-semibold opacity-80">({formatBytes(rep.attachmentSize)})</span>}
                                <Download className="h-3 w-3 shrink-0" />
                              </a>
                            )
                          )}
                          <span className={`block text-[9px] mt-1 text-right ${
                            isSenderSelf
                              ? 'text-orange-200'
                              : isAdminViewer && isHrSender
                                ? 'text-orange-700/80'
                                : 'text-slate-400'
                          }`}>
                            {formatTicketDate(rep.timestamp)}
                          </span>
                        </div>
                        {showSeen && (
                          <span className={`block text-[9px] font-semibold mt-1 ${isSenderSelf ? 'text-right' : 'text-left'} text-slate-400`}>
                            Seen
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                <TypingIndicator names={typingNames} />
                <div ref={chatEndRef} />
              </div>

              {/* Chat input bar. Uses arbitrary-value padding-bottom
                  (below) instead of `p-3 md:p-4 pb-safe` — both would set
                  padding-bottom at the same cascade specificity; see
                  globals.css's .pb-safe comment. Responsive base
                  (0.75rem/1rem) preserved, inset added on top of each. */}
              <div className="px-3 md:px-4 pt-3 md:pt-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-slate-200 bg-white">
                {isClosed ? (
                  <div className="text-xs text-slate-400 font-semibold italic text-center py-2 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center gap-1 flex-wrap">
                    <Lock className="h-3.5 w-3.5 shrink-0" /> This support ticket is closed and read-only.
                    {selectedTicket.replies.some(r => r.attachmentUrl) && (
                      <span className="text-slate-400">Any attached files will be automatically deleted 15 days after closing.</span>
                    )}
                  </div>
                ) : isAdmin ? (
                  <div className="text-xs text-slate-400 font-semibold italic text-center py-2 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 shrink-0" /> Admins can only view logs and history. Replies are disabled.
                  </div>
                ) : (
                  <form onSubmit={handleSendReply} className="space-y-2">
                    {replyFileError && (
                      <div className="p-2 text-[10px] bg-rose-50 text-rose-600 border border-rose-100 rounded-lg font-semibold flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />{replyFileError}
                      </div>
                    )}
                    {replyFile && (
                      <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-semibold text-slate-600">
                        <span className="flex items-center gap-1.5 truncate"><FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" /> {replyFile.name}</span>
                        <button type="button" onClick={() => setReplyFile(null)} className="text-slate-400 hover:text-rose-600 shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <label
                        title="Attach a file"
                        className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors cursor-pointer shrink-0 flex items-center justify-center"
                      >
                        <Paperclip className="h-4 w-4" />
                        <input ref={replyFileInputRef} type="file" accept="image/*,application/pdf" onChange={handleReplyFileChange} className="hidden" />
                      </label>
                      
                      <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-3xl pr-2 md:pr-3">
                        <textarea
                          ref={replyTextareaRef}
                          value={replyMsg}
                          onChange={e => handleReplyMsgChange(e.target.value)}
                          onKeyDown={e => {
                            // On the native mobile app, the on-screen keyboard's
                            // Enter/Return key should always insert a line break —
                            // there's no Shift key on a phone to combine with, so
                            // treating Enter as "send" there means every attempt
                            // at a multi-line reply sends the message prematurely.
                            // Desktop web keeps Enter-to-send / Shift+Enter-for-
                            // newline, since a physical keyboard has both keys.
                            if (e.key === 'Enter' && !e.shiftKey && !isNativeMobileApp()) {
                              e.preventDefault();
                              sendReply();
                            }
                          }}
                          placeholder="Type your reply..."
                          rows={1}
                          className="flex-1 bg-transparent py-3 px-3 md:px-4 text-xs md:text-sm outline-none text-slate-900 resize-none max-h-28 min-h-[40px] w-full"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={(!replyMsg.trim() && !replyFile) || sendingReply}
                        className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold active:scale-97 transition-colors transition-transform flex items-center justify-center shadow-sm shrink-0"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-200 rounded-xl bg-white/50 py-32 text-center text-slate-400 font-semibold italic text-sm">
              Select a support ticket from the list to view history and chat logs.
            </div>
          )}
        </div>
      </div>

      {/* New ticket modal */}
      <Modal isOpen={isNewOpen} onClose={() => { setIsNewOpen(false); setNewTicketFile(null); setNewTicketFileError(''); }} title="File Support Ticket">
        <form onSubmit={handleOpenTicket} className="space-y-4">
          {success && (
            <div className="p-3 text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> {success}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Department *</label>
            <select required value={department} onChange={e => setDepartment(e.target.value as 'hr' | 'technical')} className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900 appearance-none">
              <option value="hr">Human Resources</option>
              <option value="technical">Technical Team</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Ticket Title / Topic *</label>
            <input type="text" required value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900" placeholder="e.g. Salary discrepancy / System access issues" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Describe the Problem *</label>
            <textarea required rows={4} value={desc} onChange={e => setDesc(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900 resize-none" placeholder="Explain the situation in details so HR can assist you..." />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Attachment (optional)</label>
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
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" disabled={isOpeningTicket} onClick={() => { setIsNewOpen(false); setNewTicketFile(null); setNewTicketFileError(''); }} className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
            <button type="submit" disabled={isOpeningTicket} className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
              {isOpeningTicket && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isOpeningTicket ? 'Filing…' : 'File Ticket'}
            </button>
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
              <button onClick={() => setInspectEmployee(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs">
                Close Inspector
              </button>
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
    </div>
  );
}
