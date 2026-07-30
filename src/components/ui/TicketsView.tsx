'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useProfiles, useTickets, hrActions, Ticket, TicketPresence, Profile, markTicketActivitySeen, displayName } from '@/lib/hrData';
import { getSessionEmail } from '@/lib/session';
import { compressImageToWebP, validatePdfSize, fileToDataUrl, MAX_DOCUMENT_IMAGE_BYTES } from '@/lib/imageCompressor';
import { HelpCircle, Plus, Send, Lock, RotateCcw, User, Mail, Calendar, Briefcase, Users, Eye, CheckCircle2, AlertCircle, Paperclip, X, FileText, Download, Headset, Loader2, ArrowLeft } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { pushModal, popModal } from '@/lib/modalStack';
import { isNativeMobileApp } from '@/lib/trackerSetup';

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
  return d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

  // Modals
  const [isNewOpen, setIsNewOpen] = useState(false);
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

  const isPrivileged = role === 'hr' || role === 'admin';

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

  const applyTickets = (all: Ticket[], email: string) => {
    if (role === 'employee' || role === 'team_lead') {
      setTickets(all.filter(t => t.employeeEmail.toLowerCase() === email.toLowerCase()));
    } else {
      setTickets(all);
    }
    // Keep the open conversation live too, so incoming replies from other
    // users/devices show up without the viewer needing to reselect it.
    setSelectedTicket(prev => {
      if (!prev) return prev;
      return all.find(t => t.id === prev.id) || prev;
    });
  };

  const { data: allProfiles, refetch: refetchProfiles } = useProfiles();
  const { data: allTickets, refetch: refetchTickets } = useTickets();

  useEffect(() => {
    const email = getSessionEmail() || '';
    setCurrentEmail(email);
    
    if (allProfiles) {
      setEmployees(allProfiles);
      setUserProfile(allProfiles.find(e => e.email && email && e.email.toLowerCase() === email.toLowerCase()) || null);
    }

    if (allTickets) {
      applyTickets(allTickets, email);
      // Viewing this page clears the sidebar's unseen-activity dot for this
      // role+email. Re-runs on every poll while the page stays open, so new
      // activity that arrives elsewhere still lights the dot back up later.
      markTicketActivitySeen(allTickets, role, email);
    }
  }, [role, allProfiles, allTickets]);

  // Scroll chat to bottom when replies change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedTicket?.replies]);

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
    if (role !== 'hr' || !selectedTicket || selectedTicket.status === 'closed') return;
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
      });

      // hr_tickets has no attachment column, so a file selected at filing time
      // is attached as an immediate follow-up reply on the freshly created
      // ticket instead (see createTicket's comment in hrData.ts).
      if (attachment && !attachment.error) {
        await hrActions.addTicketReply(created, {
          senderName: userProfile.fullName,
          senderRole: role,
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

    const senderName = userProfile?.fullName || (role === 'hr' ? 'HR Manager' : role === 'admin' ? 'System Admin' : currentEmail.split('@')[0]);

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
        message: replyMsg.trim(),
        ...attachmentFields,
      });

      refetchTickets();
      setReplyMsg('');
      setReplyFile(null);
    } finally {
      setSendingReply(false);
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
          <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Active Tickets ({tickets.length})</h3>
          <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
            {tickets.map(t => {
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
                    <Badge variant={t.status === 'open' ? 'warning' : 'success'}>
                      {t.status === 'open' ? 'Open' : 'Closed'}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-1 mb-2">{t.description}</p>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
                    <span className="flex items-center gap-1"><User className="h-3 w-3" /> {nameFor(t.employeeName)}</span>
                    <span>{formatTicketDate(t.createdAt)}</span>
                  </div>
                </Card>
              );
            })}
            {tickets.length === 0 && (
              <div className="text-center py-12 text-slate-400 font-semibold italic text-xs border border-dashed border-slate-200 rounded-xl bg-white">
                No tickets listed.
              </div>
            )}
          </div>
        </div>

        {/* Conversation Chat Panel. bottom-0, not bottom-[64px] — this panel
            only ever renders fixed when selectedTicket is truthy, which is
            the exact same condition that calls pushModal() (above) to hide
            the floating bottom pill nav (Sidebar.tsx, via modalStack). So
            there's no state where this panel is fixed AND that nav is still
            visible — reserving 64px for it left a dead gap at the bottom of
            the screen with everything else pushed up into it. The reply
            bar / "Replies disabled" banner further down already has its own
            safe-area bottom padding (env(safe-area-inset-bottom)), so
            bottom-0 here doesn't put anything under the home indicator. */}
        <div className={`lg:col-span-7 ${!selectedTicket ? 'hidden lg:block' : 'block fixed inset-0 z-40 bg-white lg:static lg:z-auto lg:bg-transparent'}`}>
          {selectedTicket ? (
            <div className="border-0 lg:border border-slate-200 overflow-hidden flex flex-col h-full lg:h-[calc(100vh-220px)] min-h-[560px] lg:rounded-xl bg-white">
              {/* Header. pt-safe added — on mobile this whole panel is
                  `fixed inset-x-0 top-0` (see the wrapping div above), which
                  on notched/Dynamic-Island iPhones put the ticket title
                  under the status bar with no way to tap "back". pt-safe is
                  a no-op on the lg: static/desktop layout and on web. */}
              <div className="px-3.5 lg:px-5 py-2.5 lg:py-4 pt-safe bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 md:gap-4">
                {/* `grow` (flex-grow only) instead of `flex-1` — flex-1 sets
                    the `flex` shorthand (flex: 1 1 0%), which stomps on
                    basis-full's flex-basis: 100% depending on Tailwind's
                    generated stylesheet order (same same-property cascade
                    collision as the pt-safe/pb-safe bug — see globals.css).
                    That silently kept this block from actually taking the
                    full row width on mobile, so it never wrapped onto its
                    own line and the Operations button got squeezed onto
                    the same row instead of the row below it. */}
                <div className="flex items-start gap-2 grow min-w-0 basis-full lg:basis-auto lg:items-center">
                  <button onClick={() => setSelectedTicket(null)} className="lg:hidden h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300">
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 truncate">
                    <span className="truncate">{selectedTicket.title}</span>
                    {isEmp && isTicketLiveWithHR(selectedTicket.id) && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <Headset className="h-3 w-3" /> Live
                      </span>
                    )}
                  </h3>
                  <div className="text-[10px] text-slate-600 font-bold mt-0.5 flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0 whitespace-nowrap">Opened by:</span>
                    <button
                      onClick={() => handleInspectApplicant(selectedTicket.employeeEmail)}
                      className="text-orange-700 hover:underline flex items-center gap-0.5 min-w-0"
                    >
                      <span className="truncate">{nameFor(selectedTicket.employeeName)}</span>
                      <Eye className="h-3 w-3 shrink-0" />
                    </button>
                  </div>
                </div>
                </div>

                {/* Operations. ml-auto, not a fixed ml-10 — the title/
                    opened-by block above is basis-full on mobile, so this
                    div wraps onto its own flex line; a fixed left margin
                    just offsets it from the left edge on that line instead
                    of pushing it to the right, which is what left it
                    stranded near the left with a lot of dead space next
                    to it. margin-left: auto is what actually pushes an
                    item to the end of its own flex line. lg:ml-0 cancels
                    it back out on desktop, where this div already shares
                    the title's row and justify-between (on the parent)
                    handles right-alignment on its own. */}
                <div className="flex items-center gap-2 shrink-0 ml-auto lg:ml-0">
                  {isHR && !isClosed && (
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
                  {isHR && isClosed && (
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
                  {isClosed && !isHR && (
                    <span className="text-[10px] font-bold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Closed by HR
                    </span>
                  )}
                </div>
              </div>

              {/* Chat replies log */}
              <div className="flex-1 min-h-0 p-5 space-y-4 overflow-y-auto bg-slate-50/30">
                {/* Employee Description */}
                {(() => {
                  const isAuthorSelf = role === 'employee' || role === 'team_lead';
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
                {selectedTicket.replies.map(rep => {
                  let isSenderSelf = false;
                  if (role === 'hr' && rep.senderRole === 'hr') isSenderSelf = true;
                  else if (role === 'admin' && rep.senderRole === 'admin') isSenderSelf = true;
                  else if ((role === 'employee' || role === 'team_lead') && (rep.senderRole === 'employee' || rep.senderRole === 'team_lead')) isSenderSelf = true;

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
                    </div>
                  );
                })}
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
                          onChange={e => setReplyMsg(e.target.value)}
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
                <span className="text-slate-800">{new Date(inspectEmployee.joinedDate).toLocaleDateString('en-US', { dateStyle: 'medium' })}</span>
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
