'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Team, Profile, Message, useMessages, useTeamDocuments, hrActions, displayName, buildNotificationLink, HR_ADMIN_LINE_TEAM_ID } from '@/lib/hrData';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { TeamDocumentsPanel } from './TeamDocumentsPanel';
import { FileText, ShieldCheck, Loader2, SlidersHorizontal, X, Megaphone, MessageCircle, FolderOpen, Users } from 'lucide-react';
import { ImageLightbox } from './ImageLightbox';
import { Button } from './Button';
import { FormField } from '@/components/ui/FormField';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchInput } from '@/components/ui/SearchInput';
import { RoleBadge, MAX_ATTACHMENT_BYTES, formatTimestamp, FileTypeFilter, SizeFilter, attachmentKind, sizeBucket } from "@/components/ui/chat/chatHelpers";
import { Input, Select, Textarea } from '@/components/ui/Input';
import { ChatComposer } from "@/components/ui/chat/ChatComposer";
import { ChatMessageList } from "@/components/ui/chat/ChatMessageList";
import type { ReadScope } from '@/lib/hr/shared';
import { setAdaptiveInterval } from '@/lib/idle';

// Curated, no-dependency emoji set for the composer's emoji picker — avoids
// pulling in an emoji-picker package (and its bundle size / build-tool
// dependency) just for this. Grouped loosely so the picker doesn't read as
// a random wall of glyphs; browsers/OSes render these as native emoji, no
// image assets needed.
// Tiny "announcement styled" read receipt for a single message — a small
// overlapping avatar facepile plus a count, tucked right under the bubble.
// Renders nothing until at least one other person has actually viewed the
// message (no dashed-placeholder state here, unlike the Announcements
// panel's version — that would put a "0 viewed" line under every single
// chat message, which is exactly the UI clutter this was asked to avoid).
// Small role badge shown next to a name — used both in the Members panel
// and (for HR/Team Lead) next to a sender's name on their messages, so
// anyone reading the channel can immediately tell who's HR/Admin/a Team
// Lead vs. a regular employee. Admin already had its own purple+Crown
// treatment on messages (see isAdminSender below, kept as-is since it also
// recolors the whole bubble); this covers the two roles that previously had
// no visual distinction at all. Returns null for a plain employee — no
// badge needed there.

interface TeamChatViewProps {
  teams: Team[];
  currentUserEmail: string;
  currentUserRole: 'admin' | 'hr' | 'employee' | 'team_lead';
  allProfiles: Profile[];
  // Admin's dedicated Team Chats page: sees every team (not just their own),
  // and shows a "you're viewing every channel" label. Admin can still post
  // in any of them — see the Crown/highlight styling below for how their
  // messages are made unmistakable to everyone else in the channel.
  oversight?: boolean;
  // If true, injects a virtual "HR & Admin" DM channel for this employee.
  includeHrDirectChannel?: boolean;
  // Controls how the channel selector looks on mobile. 'horizontal' (default)
  // is a scrolling list of pills. 'dropdown' uses a native `<select>`.
  mobileSelectorStyle?: 'horizontal' | 'dropdown';
}

// Small (<1MB) / Medium (1-5MB) / Large (>5MB) — coarse buckets, matches
// the sizes people actually think in rather than exact byte ranges.
// Display tag for a forwarded message's card — see the "Forward" action
// on tickets/announcements/chat messages (hrActions.forwardToHrAdminLine
// in hrData.ts) and the m.isForward rendering branch below.
// Highlights "@Display Name" mentions AND "#Document Title" tags in message
// text. Doc tags are matched against whichever documents currently exist
// for this team (same "resolve live, don't trust the snapshot" approach as
// mentions) and render as clickable links straight to the file — that's
// the "tag a document to ask questions about it" feature: typing #Title in
// chat both highlights it and opens the doc for anyone reading the thread.

// Typing-indicator pace: warm channel / quiet channel, and how long without a message or
// typing counts as quiet.
const CHAT_TYPING_POLL_MS = 5000;
const CHAT_TYPING_QUIET_POLL_MS = 15000;
const CHAT_QUIET_AFTER_MS = 2 * 60 * 1000;

export function TeamChatView({ teams: propTeams, currentUserEmail, currentUserRole, allProfiles, oversight = false, includeHrDirectChannel = false, mobileSelectorStyle = 'horizontal' }: TeamChatViewProps) {
  const me = allProfiles.find(p => p.email.toLowerCase() === currentUserEmail.toLowerCase());
  
  const teams = React.useMemo(() => {
    if (!includeHrDirectChannel || !me) return propTeams;
    const hrTeam: Team = {
      id: `dm_${me.id}`,
      name: 'HR & Admin',
      members: [], // It's a virtual channel, members list isn't used for DMs
    };
    // If the virtual team is already active, we shouldn't change the active id, 
    // but we prepend it so it's always at the top of the sidebar.
    return [hrTeam, ...propTeams];
  }, [includeHrDirectChannel, me, propTeams]);

  const [activeTeamId, setActiveTeamId] = useState<string | null>(teams[0]?.id || null);
  const [draft, setDraft] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  // @mention autocomplete — `mention` is null when the dropdown is closed,
  // otherwise tracks the query typed after "@" and where that "@" is in
  // `draft` so a picked suggestion can replace exactly that span.
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  // Profiles picked from the dropdown this compose session, so on send we
  // know exactly who to notify — far more reliable than re-parsing text.
  const [mentionedProfiles, setMentionedProfiles] = useState<Map<string, Profile>>(new Map());
  // "#" document-tag autocomplete — same idea as @mention above, but for
  // referencing a Team Document instead of a person. Mirrors `mention`'s
  // shape (query + where the "#" trigger sits in `draft`).
  const [docTag, setDocTag] = useState<{ query: string; start: number } | null>(null);
  // Which panel is showing: the chat thread, or the Team Documents library
  // for the active team.
  const [activePanel, setActivePanel] = useState<'chat' | 'documents'>('chat');
  // Composer's "send as Announcement" toggle.
  const [draftIsAnnouncement, setDraftIsAnnouncement] = useState(false);
  // Search & filter panel.
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState<FileTypeFilter>('all');
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>('all');
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  // "Who's in this channel" panel — see mentionCandidates below, the same
  // list already used to drive @mention suggestions (team members + every
  // Admin, since Admin can post in any channel).
  const [showMembers, setShowMembers] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  // Image attachments used to open via <a target="_blank"> pointing at a
  // base64 data: URL — same Capacitor/Android WebView gotcha already fixed
  // in the Tickets view: that hands the URL off to an external browser
  // intent, which either fails silently or opens a blank tab since there's
  // no real document to navigate to. Rendered in-app via ImageLightbox
  // instead, same as Tickets.
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxName, setLightboxName] = useState<string | undefined>(undefined);
  // "Forward to HR & Admin" — the chat-message trigger point of the 3-way
  // forward mechanism (see hrActions.forwardToHrAdminLine in hrData.ts;
  // the other 2 live in TicketsView.tsx and the admin/hr dashboard
  // announcement panels). forwardTarget holds a snapshot of whichever
  // message the Forward icon was clicked on; null means the modal is
  // closed. Only rendered for hr/admin viewers — see the Forward icon
  // button in the message list below.
  const [forwardTarget, setForwardTarget] = useState<{ sourceLabel: string; sourceId: string; preview: string; attachmentUrl?: string; attachmentName?: string } | null>(null);
  const [forwardNote, setForwardNote] = useState('');
  const [forwarding, setForwarding] = useState(false);
  const [forwardError, setForwardError] = useState('');
  const canForward = currentUserRole === 'hr' || currentUserRole === 'admin';

  const openForwardModal = (m: Message) => {
    setForwardTarget({
      sourceLabel: activeTeam?.name || 'Team Chat',
      sourceId: activeTeamId || '',
      preview: m.text || (m.attachmentName ? `Attachment: ${m.attachmentName}` : ''),
      attachmentUrl: m.attachmentUrl,
      attachmentName: m.attachmentName,
    });
    setForwardNote('');
    setForwardError('');
  };

  const submitForward = async () => {
    if (!forwardTarget || forwarding) return;
    setForwarding(true);
    setForwardError('');
    try {
      const senderProfile = emailToProfile.get(normEmail(currentUserEmail));
      await hrActions.forwardToHrAdminLine(
        currentUserEmail,
        senderProfile?.fullName || currentUserEmail,
        currentUserRole === 'admin' ? 'admin' : 'hr',
        'chat',
        forwardTarget.sourceLabel,
        forwardTarget.sourceId,
        forwardNote,
        forwardTarget.attachmentUrl,
        forwardTarget.attachmentName,
      );
      setForwardTarget(null);
      setForwardNote('');
    } catch (err) {
      console.error('Forward message failed:', err);
      setForwardError('Could not forward that message. Please try again.');
    } finally {
      setForwarding(false);
    }
  };
  // Small "announcement styled" read receipts — see hrActions.getMessageReadMap
  // / markMessagesSeen in hrData.ts. Kept deliberately tiny (see the facepile
  // JSX below) so it reads as a subtle detail under your own messages, not a
  // second UI competing with the chat itself.
  const [messageReadMap, setMessageReadMap] = useState<Record<string, string[]>>({});
  const [viewersMsgId, setViewersMsgId] = useState<string | null>(null);
  // Receipts only matter for people who can actually see this channel: its
  // members plus HR/Admin (who oversee every channel). Ask for just their
  // read rows instead of every employee's.
  const openTeamName = (propTeams.find(t => t.id === activeTeamId))?.name;
  const receiptScope: ReadScope = {
    emails: [currentUserEmail, ...allProfiles
      .filter(p => p.role === 'hr' || p.role === 'admin' || (!!openTeamName && ((p.teams || []).includes(openTeamName) || (p.leadTeams || []).includes(openTeamName))))
      .map(p => p.email)],
  };
  // "X is typing…" — names of everyone else currently typing in the active
  // channel, refreshed on a short poll (see the effect below). Empty most
  // of the time; TypingIndicator renders nothing when this is [].
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const lastTypingTouchRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const emojiWrapperRef = useRef<HTMLDivElement>(null);

  // Closes the emoji picker on an outside click. Lives up here (wrapping
  // both the toggle button and the panel) rather than inside EmojiPicker
  // itself so a click on the toggle button isn't treated as "outside" —
  // see the comment on EmojiPicker above.
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleOutside = (e: MouseEvent) => {
      if (emojiWrapperRef.current && !emojiWrapperRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showEmojiPicker]);

  // Deep-linking from a notification click (?teamId=...) — same one-shot,
  // window.location.search-based approach as TicketsView's ?ticketId=
  // handling (see its comment for why this avoids next/navigation's
  // useSearchParams). Takes priority over the teams[0] default below, but
  // only once and only if the linked team is actually one this viewer can
  // see; otherwise it falls through to the normal default.
  const appliedChatDeepLinkRef = useRef(false);
  useEffect(() => {
    if (activeTeamId || teams.length === 0) return;
    if (!appliedChatDeepLinkRef.current && typeof window !== 'undefined') {
      const targetId = new URLSearchParams(window.location.search).get('teamId');
      if (targetId && teams.some(t => t.id === targetId)) {
        appliedChatDeepLinkRef.current = true;
        // This genuinely belongs in an effect, not render: it's reading
        // window.location (an external, client-only system guarded by the
        // typeof-window check above) and immediately following up with a
        // real side effect on that same system (history.replaceState) to
        // strip the ?teamId= param once it's been applied — not just a
        // plain prop-driven state reset, which is what the
        // react-hooks/set-state-in-effect rule is meant to steer away from.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveTeamId(targetId);
        window.history.replaceState(null, '', window.location.pathname);
        return;
      }
      // No matching team to deep-link to (bad id, or this viewer isn't on
      // that team) — don't keep retrying every render, just fall through
      // to the default below.
      appliedChatDeepLinkRef.current = true;
    }
    setActiveTeamId(teams[0].id);
  }, [teams, activeTeamId]);

  const [messageLimit, setMessageLimit] = useState(50);
  const { data: messages = [], isLoading } = useMessages(activeTeamId, messageLimit);
  const { data: teamDocuments = [] } = useTeamDocuments(activeTeamId);
  const docTagList = teamDocuments.map(d => ({ title: d.title, url: d.fileUrl }));

  // Reset per-channel UI/composer state when switching teams — a message
  // window, filter, mention selection, or typing indicator set up for one
  // channel isn't meaningful in another. Done synchronously during render
  // (React's documented pattern for "adjusting state when a prop changes",
  // see https://react.dev/learn/you-might-not-need-an-effect) rather than
  // in a useEffect, so nothing ever renders with the previous channel's
  // stale state, even for one frame.
  const [resetForTeamId, setResetForTeamId] = useState(activeTeamId);
  if (activeTeamId !== resetForTeamId) {
    setResetForTeamId(activeTeamId);
    setMessageLimit(50);
    setSearchQuery(''); setDateFrom(''); setDateTo('');
    setFileTypeFilter('all'); setSizeFilter('all'); setShowFilters(false);
    setMention(null);
    setMentionedProfiles(new Map());
    setDocTag(null);
    setShowEmojiPicker(false);
    setTypingNames([]);
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, activeTeamId, typingNames.length]);

  // Fetch the read-receipt map for whatever's currently on screen, and mark
  // it as seen by the current viewer — same "seen on arrival" pattern as
  // Announcements, just scoped to one channel's currently-loaded messages
  // rather than the whole list.
  useEffect(() => {
    if (!activeTeamId || messages.length === 0 || !currentUserEmail) return;
    hrActions.getMessageReadMap(receiptScope).then(setMessageReadMap);
    hrActions.markMessagesSeen(messages, currentUserEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeamId, messages.length, currentUserEmail]);

  const viewersForMessage = (msgId: string): Profile[] => {
    const emails = (messageReadMap[msgId] || [])
      .map(e => e.toLowerCase())
      .filter(e => e !== currentUserEmail.toLowerCase());
    return allProfiles.filter(p => emails.includes(normEmail(p.email)));
  };

  const openMessageViewers = (msgId: string) => {
    setViewersMsgId(msgId);
    hrActions.getMessageReadMap(receiptScope).then(setMessageReadMap);
  };

  // "X is typing…" — poll everyone else's typing state for the active channel.
  // There's no presence signal for chat, so instead of polling every 2s forever:
  //  - 5s ticks while the channel is "warm" (a message arrived or someone was
  //    typing within the last 2 minutes), backing off to 15s once it's quiet —
  //    any new message or typing snaps it back to 5s;
  //  - hidden tabs are skipped and idle people poll 3x slower (setAdaptiveInterval).
  // The reset of this device's own typing marker on channel switch lives in the
  // render-time block above (setTypingNames([])); this effect only owns polling.
  const typingQuietSinceRef = React.useRef(0); // set to the real time by the effect below
  useEffect(() => { typingQuietSinceRef.current = Date.now(); }, [messages.length, activeTeamId]);
  useEffect(() => {
    if (!activeTeamId || !currentUserEmail) return;
    let cancelled = false;
    const poll = () => {
      hrActions.getTypingUsers('chat', activeTeamId, currentUserEmail).then(rows => {
        if (cancelled) return;
        if (rows.length > 0) typingQuietSinceRef.current = Date.now();
        setTypingNames(rows.map(r => r.displayName));
      }).catch(() => {});
    };
    poll();
    const stop = setAdaptiveInterval(poll, () => (Date.now() - typingQuietSinceRef.current > CHAT_QUIET_AFTER_MS ? CHAT_TYPING_QUIET_POLL_MS : CHAT_TYPING_POLL_MS));
    return () => {
      cancelled = true;
      stop();
      hrActions.clearTypingState('chat', activeTeamId, currentUserEmail).catch(() => {});
    };
  }, [activeTeamId, currentUserEmail]);

  // Trimmed as well as lower-cased — a stray leading/trailing space on
  // either side (e.g. from a copy-pasted email during onboarding) would
  // silently break this lookup and show the initials fallback instead of
  // the sender's real photo, with no visible error anywhere.
  const normEmail = (e: string) => e.trim().toLowerCase();
  const emailToProfile = new Map(allProfiles.map(p => [normEmail(p.email), p]));

  const hasActiveFilters = !!(searchQuery || dateFrom || dateTo || fileTypeFilter !== 'all' || sizeFilter !== 'all');

  const filteredMessages = messages.filter(m => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const senderMatch = m.senderName.toLowerCase().includes(q) || emailToProfile.get(normEmail(m.senderEmail))?.alias?.toLowerCase().includes(q);
      const textMatch = (m.text || '').toLowerCase().includes(q);
      const fileMatch = (m.attachmentName || '').toLowerCase().includes(q);
      if (!senderMatch && !textMatch && !fileMatch) return false;
    }
    if (dateFrom && new Date(m.timestamp) < new Date(dateFrom)) return false;
    if (dateTo && new Date(m.timestamp) > new Date(`${dateTo}T23:59:59`)) return false;
    if (fileTypeFilter === 'announcement' && !m.isAnnouncement) return false;
    if (fileTypeFilter !== 'all' && fileTypeFilter !== 'announcement' && attachmentKind(m.attachmentName) !== fileTypeFilter) return false;
    if (sizeFilter !== 'all' && sizeBucket(m.attachmentSize) !== sizeFilter) return false;
    return true;
  });

  const announcements = messages.filter(m => m.isAnnouncement);

  const activeTeam = teams.find(t => t.id === activeTeamId);
  // HR & Admin Line gets its own card treatment (see the message-rendering
  // branch below) — a permanent two-party channel where the whole point is
  // "who sent this, HR or Admin" being unmistakable at a glance, regardless
  // of whether you're the sender or the reader. Everywhere else (Team Chat,
  // DMs) keeps the existing self/other bubble convention untouched.
  const isHrAdminLine = activeTeamId === HR_ADMIN_LINE_TEAM_ID;
  // Who can upload/delete Team Documents for the active team: Admin and HR
  // always, a Team Lead only for a team they actually lead (not just any
  // team they happen to be shown, and not a regular member).
  const canManageDocuments =
    currentUserRole === 'admin' ||
    currentUserRole === 'hr' ||
    (currentUserRole === 'team_lead' && !!activeTeam?.leadEmail && activeTeam.leadEmail.toLowerCase() === currentUserEmail.toLowerCase());
  // Who can be @mentioned in this channel: everyone currently on the team,
  // plus every Admin (they can post — and therefore be mentioned — in any
  // team's chat even without being a formal member). Deliberately includes
  // the current viewer too — this list doubles as the "who to highlight"
  // list when rendering already-sent messages, and excluding yourself
  // would mean a message mentioning you never gets highlighted in your own
  // view. Resolved live so it stays correct as team membership/roles/
  // aliases change after the fact.
  const mentionCandidates: Profile[] = (() => {
    const emails = new Set((activeTeam?.members || []).map(e => e.toLowerCase()));
    allProfiles.forEach(p => { if (p.role === 'admin') emails.add(p.email.toLowerCase()); });
    return [...emails].map(e => emailToProfile.get(e)).filter((p): p is Profile => !!p);
  })();
  const mentionLabels = mentionCandidates.map(p => displayName(p, currentUserRole));
  // Composer dropdown specifically excludes yourself — mentioning yourself
  // isn't useful.
  const mentionDropdownCandidates = mentionCandidates.filter(p => p.email.toLowerCase() !== currentUserEmail.toLowerCase());

  // Resolve the sender label live through the current profile/alias, not
  // the stored senderName snapshot — so a later Alias edit applies
  // retroactively to old messages too. Falls back to the snapshot if the
  // profile can't be found (e.g. the sender was since deleted).
  const senderLabel = (m: Message): string => {
    const profile = emailToProfile.get(normEmail(m.senderEmail));
    if (profile) return displayName(profile, currentUserRole);
    // Sender profile no longer exists (e.g. deleted employee) — fall back
    // to the real-name snapshot regardless of viewer role. This is a rare
    // edge case, not a fresh privacy leak: the alias-masking guarantee only
    // ever applied to accounts that still exist.
    return m.senderName;
  };

  const handleFilePick = (file: File | undefined) => {
    setSendError('');
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setSendError('File is too large — 100MB max.');
      return;
    }
    setPendingFile(file);
  };

  // Filtered dropdown suggestions for the current "@query".
  const mentionSuggestions = mention
    ? mentionDropdownCandidates
        .filter(p => displayName(p, currentUserRole).toLowerCase().startsWith(mention.query.toLowerCase()))
        .slice(0, 6)
    : [];

  // Filtered dropdown suggestions for the current "#query" — documents in
  // this team whose title starts with (or contains) what's typed.
  const docTagSuggestions = docTag
    ? teamDocuments
        .filter(d => d.title.toLowerCase().includes(docTag.query.toLowerCase()))
        .slice(0, 6)
    : [];

  const handleDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart ?? value.length;
    setDraft(value);

    // Touch the typing marker at most once every 1.5s (not on every
    // keystroke — this is a KV write, no need to hammer it) while there's
    // actually text in the box; clear it immediately once the box is
    // emptied (e.g. select-all + delete) rather than waiting for it to go
    // stale.
    if (activeTeamId && currentUserEmail) {
      if (value.trim()) {
        // Date.now() here runs inside this onChange handler, never during
        // render — the react-hooks/purity rule can't prove that statically
        // for a named (non-inline) handler function, so it flags it as if
        // it were called from the render body itself.
        // eslint-disable-next-line react-hooks/purity
        const now = Date.now();
        if (now - lastTypingTouchRef.current > 1500) {
          lastTypingTouchRef.current = now;
          const senderProfile = emailToProfile.get(normEmail(currentUserEmail));
          hrActions.touchTypingState('chat', activeTeamId, currentUserEmail, senderProfile?.fullName || currentUserEmail).catch(() => {});
        }
      } else {
        lastTypingTouchRef.current = 0;
        hrActions.clearTypingState('chat', activeTeamId, currentUserEmail).catch(() => {});
      }
    }

    const upToCursor = value.slice(0, cursor);
    const atIndex = upToCursor.lastIndexOf('@');
    const hashIndex = upToCursor.lastIndexOf('#');
    // Whichever trigger char sits closer to the cursor wins — lets someone
    // switch from typing a mention to a doc tag (or vice versa) without the
    // stale trigger's dropdown lingering.
    const triggerIndex = Math.max(atIndex, hashIndex);
    if (triggerIndex === -1) { setMention(null); setDocTag(null); return; }
    const between = upToCursor.slice(triggerIndex + 1, cursor);
    // Bail out once the trigger is followed by whitespace — that's a
    // finished word, not an in-progress mention/tag anymore.
    if (/\s/.test(between)) { setMention(null); setDocTag(null); return; }
    if (triggerIndex === atIndex) {
      setMention({ query: between, start: atIndex });
      setDocTag(null);
    } else {
      setDocTag({ query: between, start: hashIndex });
      setMention(null);
    }
  };

  const pickMention = (profile: Profile) => {
    if (!mention) return;
    const label = displayName(profile, currentUserRole);
    const cursor = textareaRef.current?.selectionStart ?? draft.length;
    const before = draft.slice(0, mention.start);
    const after = draft.slice(cursor);
    const inserted = `@${label} `;
    const newValue = `${before}${inserted}${after}`;
    setDraft(newValue);
    setMentionedProfiles(prev => new Map(prev).set(profile.email.toLowerCase(), profile));
    setMention(null);

    // Restore focus and put the cursor right after the inserted mention so
    // the person can keep typing without having to click back in.
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const pos = before.length + inserted.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const pickDocTag = (doc: { title: string }) => {
    if (!docTag) return;
    const cursor = textareaRef.current?.selectionStart ?? draft.length;
    const before = draft.slice(0, docTag.start);
    const after = draft.slice(cursor);
    const inserted = `#${doc.title} `;
    const newValue = `${before}${inserted}${after}`;
    setDraft(newValue);
    setDocTag(null);

    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const pos = before.length + inserted.length;
      el.setSelectionRange(pos, pos);
    });
  };

  // Plain insertion at the current cursor position — unlike pickMention/
  // pickDocTag this isn't replacing a "@query"/"#query" trigger, just
  // dropping the emoji in wherever the cursor currently is.
  const insertEmoji = (emoji: string) => {
    const cursor = textareaRef.current?.selectionStart ?? draft.length;
    const before = draft.slice(0, cursor);
    const after = draft.slice(cursor);
    const newValue = `${before}${emoji}${after}`;
    setDraft(newValue);
    setShowEmojiPicker(false);

    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const pos = before.length + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleSend = async () => {
    if (!activeTeamId || sending) return;
    if (!draft.trim() && !pendingFile) return;
    setShowEmojiPicker(false);
    // Narrowed local copy — activeTeamId is `string | null` at the state
    // level, and TS can't carry the null-check above through the
    // asynchronous forEach closure below without this.
    const teamId = activeTeamId;
    const senderProfile = emailToProfile.get(normEmail(currentUserEmail));
    const teamLabel = activeTeam?.name || 'Team Chat';
    const draftAtSend = draft;
    const wasAnnouncement = draftIsAnnouncement;
    const toNotify = [...mentionedProfiles.values()];
    setSending(true);
    setSendError('');
    try {
      await hrActions.sendMessage(
        activeTeamId,
        currentUserEmail,
        senderProfile?.fullName || currentUserEmail,
        draftAtSend,
        pendingFile || undefined,
        wasAnnouncement
      );
      setDraft('');
      setPendingFile(null);
      setMentionedProfiles(new Map());
      setMention(null);
      setDocTag(null);
      setDraftIsAnnouncement(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      lastTypingTouchRef.current = 0;
      hrActions.clearTypingState('chat', activeTeamId, currentUserEmail).catch(() => {});

      // Best-effort: a failed mention notification shouldn't make the
      // message itself look like it failed to send. Each recipient sees
      // the sender's name exactly as they're normally allowed to (their
      // own role decides real name vs. Alias) — not a fixed name for
      // everyone.
      toNotify.forEach(p => {
        if (p.email.toLowerCase() === currentUserEmail.toLowerCase()) return;
        const senderLabelForRecipient = senderProfile ? displayName(senderProfile, p.role) : currentUserEmail;
        hrActions
          .addNotification(p.email, p.role, `${senderLabelForRecipient} mentioned you in ${teamLabel} chat.`, 'chat_mention', senderLabelForRecipient, currentUserEmail, buildNotificationLink(p.role, 'chat', teamId))
          .catch(err => console.error('Mention notification failed:', err));
      });

      // HR & Admin Line: every regular (non-forward) message sent
      // directly in this fixed channel also notifies the OTHER role —
      // forwards get their own, more specific notification wording from
      // hrActions.forwardToHrAdminLine instead (see submitForward above),
      // so this only covers messages typed straight into the composer.
      if (teamId === HR_ADMIN_LINE_TEAM_ID) {
        const otherRole = currentUserRole === 'hr' ? 'admin' : currentUserRole === 'admin' ? 'hr' : null;
        if (otherRole) {
          const senderLabelForOther = senderProfile?.fullName || currentUserEmail;
          hrActions
            .addNotification('all', otherRole, `${senderLabelForOther} sent a message in HR & Admin.`, 'hr_admin_line', senderLabelForOther, currentUserEmail, buildNotificationLink(otherRole, 'hr_admin', teamId))
            .catch(err => console.error('HR & Admin Line notification failed:', err));
        }
      }
    } catch (err) {
      console.error('Send message failed:', err);
      setSendError('Could not send that message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (teams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
        <ShieldCheck className="h-10 w-10 opacity-30" />
        <p className="font-semibold text-sm">{oversight ? 'No teams exist yet.' : "You're not assigned to a team yet."}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-2 md:gap-4 flex-1 h-full min-h-0">
      {/* Team selector — only shown when there's more than one team to pick from */}
      {teams.length > 1 && (
        <div className={`md:w-56 shrink-0 md:flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-1 md:pb-0 scrollbar-hide px-1 md:px-0 ${mobileSelectorStyle === 'dropdown' ? 'hidden' : 'flex'}`}>
          {teams.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTeamId(t.id)}
              className={`px-4 py-2 md:py-2.5 rounded-xl text-xs font-bold text-left whitespace-nowrap md:whitespace-normal transition-colors transition-shadow shrink-0 ${
                activeTeamId === t.id ? 'bg-orange-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.name}
              {oversight && <span className={`hidden md:block text-[9px] font-semibold mt-0.5 ${activeTeamId === t.id ? 'text-orange-100' : 'text-slate-400'}`}>{t.members.length} members</span>}
            </button>
          ))}
        </div>
      )}

      {/* Mobile Dropdown selector (only shown on mobile when requested) */}
      {teams.length > 1 && mobileSelectorStyle === 'dropdown' && (
        <div className="md:hidden shrink-0 px-1">
          <Select
            value={activeTeamId || ''}
            onChange={(e) => setActiveTeamId(e.target.value)}
            fieldSize="md" className="appearance-none"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%2364748b\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 1rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1rem' }}
          >
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </div>
      )}

      <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden min-h-0">
        <div className="px-3 py-2 md:px-5 md:py-3.5 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between shrink-0 gap-2">
          {/* Left group: team name + Chat/Documents toggle + announcement
              count. Filter is a separate, second flex child below so
              `justify-between` on this row actually has two items to split
              apart — previously Filter's `ml-auto` lived INSIDE this same
              shrink-0 group, which only sizes to its own content and never
              had spare room to push into, so it never reached the true
              right edge. */}
          <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-hide">
            <h3 className="font-bold text-slate-900 text-sm truncate hidden md:block shrink-0">
              {activeTeam?.name || 'Team Chat'}
            </h3>
            {oversight && <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mr-1 hidden sm:inline shrink-0">Viewing every channel</span>}
            {/* Chat / Team Documents tab toggle */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 mr-1 shrink-0">
              <button
                onClick={() => setActivePanel('chat')}
                className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md transition-colors transition-shadow ${
                  activePanel === 'chat' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <MessageCircle className="h-3 w-3" /> Chat
              </button>
              <button
                onClick={() => setActivePanel('documents')}
                className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md transition-colors transition-shadow ${
                  activePanel === 'documents' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <FolderOpen className="h-3 w-3" /> Documents{teamDocuments.length > 0 ? ` (${teamDocuments.length})` : ''}
              </button>
            </div>
            {activePanel === 'chat' && announcements.length > 0 && (
              <button
                onClick={() => setShowAnnouncements(v => !v)}
                className={`flex items-center gap-1 text-[10px] font-bold h-7 md:h-auto px-2 py-1.5 rounded-lg transition-colors shrink-0 ${
                  showAnnouncements ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                <Megaphone className="h-3 w-3 shrink-0" /> {announcements.length}
              </button>
            )}
            {activePanel === 'chat' && (
              <button
                onClick={() => setShowMembers(true)}
                title="See who's in this channel"
                className="flex items-center gap-1 text-[10px] font-bold h-7 md:h-auto px-2 py-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0"
              >
                <Users className="h-3 w-3 shrink-0" /> {mentionCandidates.length}
              </button>
            )}
          </div>

          {/* Right group: Filter — alone in its own flex slot so
              justify-between on the row pins it to the true right edge. */}
          {activePanel === 'chat' && (
            <button
              onClick={() => setShowFilters(v => !v)}
              title={hasActiveFilters ? `Filtered (${filteredMessages.length})` : 'Filter'}
              className={`flex items-center gap-1 text-[10px] font-bold h-7 w-7 md:h-auto md:w-auto md:px-2 md:py-1.5 rounded-lg transition-colors justify-center shrink-0 ${
                showFilters || hasActiveFilters ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              <SlidersHorizontal className="h-3 w-3 shrink-0" />
              <span className="hidden md:inline">{hasActiveFilters ? `Filtered (${filteredMessages.length})` : 'Filter'}</span>
            </button>
          )}
        </div>

        {activePanel === 'documents' && (
          <TeamDocumentsPanel
            team={activeTeam || null}
            currentUserEmail={currentUserEmail}
            currentUserRole={currentUserRole}
            currentUserName={emailToProfile.get(normEmail(currentUserEmail))?.fullName || currentUserEmail}
            canManage={canManageDocuments}
          />
        )}

        {/* Pinned Announcements */}
        {activePanel === 'chat' && showAnnouncements && announcements.length > 0 && (
          <div className="border-b border-amber-200 bg-amber-50/60 max-h-40 overflow-y-auto shrink-0">
            {announcements.slice().reverse().map(a => (
              <div key={a.id} className="px-4 py-2 border-b border-amber-100 last:border-b-0 text-xs">
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-amber-700 uppercase tracking-wider">
                  <Megaphone className="h-2.5 w-2.5" /> {senderLabel(a)} · {formatTimestamp(a.timestamp)}
                </div>
                {a.text && <p className="text-slate-700 font-medium mt-0.5">{a.text}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Search & Filter panel */}
        {activePanel === 'chat' && showFilters && (
          <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3 shrink-0 space-y-2.5">
            <SearchInput fieldSize="sm" value={searchQuery} onChange={setSearchQuery} placeholder="Search messages, senders, or file names…" />
            <div className="flex flex-wrap gap-2 items-center">
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} fieldSize="md" />
              <span className="text-[10px] text-slate-400 font-bold">to</span>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} fieldSize="md" />

              <Select value={fileTypeFilter} onChange={e => setFileTypeFilter(e.target.value as FileTypeFilter)} fieldSize="md">
                <option value="all">All types</option>
                <option value="image">Images</option>
                <option value="document">Documents</option>
                <option value="other">Other files</option>
                <option value="none">Text only</option>
                <option value="announcement">Announcements</option>
              </Select>

              <Select value={sizeFilter} onChange={e => setSizeFilter(e.target.value as SizeFilter)} fieldSize="md">
                <option value="all">Any size</option>
                <option value="small">Small (&lt;1MB)</option>
                <option value="medium">Medium (1–5MB)</option>
                <option value="large">Large (&gt;5MB)</option>
              </Select>

              {hasActiveFilters && (
                <button
                  onClick={() => { setSearchQuery(''); setDateFrom(''); setDateTo(''); setFileTypeFilter('all'); setSizeFilter('all'); }}
                  className="flex items-center gap-1 text-[10px] font-bold text-rose-600 hover:text-rose-700 ml-auto"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
          </div>
        )}

        {activePanel === 'chat' && (
        <ChatMessageList scrollRef={scrollRef} messages={messages} messageLimit={messageLimit} setMessageLimit={setMessageLimit} isLoading={isLoading} filteredMessages={filteredMessages} currentUserEmail={currentUserEmail} senderLabel={senderLabel} emailToProfile={emailToProfile} normEmail={normEmail} canForward={canForward} openForwardModal={openForwardModal} mentionLabels={mentionLabels} docTagList={docTagList} setLightboxSrc={setLightboxSrc} setLightboxName={setLightboxName} viewersForMessage={viewersForMessage} openMessageViewers={openMessageViewers} currentUserRole={currentUserRole} isHrAdminLine={isHrAdminLine} typingNames={typingNames} />
        )}
        {activePanel === 'chat' && (
          /* Uses arbitrary-value padding-bottom (below) instead of
             `p-2 md:p-3 pb-safe` — both would set padding-bottom at the
             same cascade specificity; see globals.css's .pb-safe
             comment. Responsive base (0.5rem/0.75rem) preserved,
             safe-area inset added on top of each. Plain comment syntax
             here on purpose, not the curly-brace JSX-children form,
             since this sits right after the && opening paren — still a
             plain JS expression slot, not JSX children. */
          <ChatComposer oversight={oversight} activeTeam={activeTeam} draftIsAnnouncement={draftIsAnnouncement} sendError={sendError} pendingFile={pendingFile} setPendingFile={setPendingFile} fileInputRef={fileInputRef} mention={mention} mentionSuggestions={mentionSuggestions} pickMention={pickMention} currentUserRole={currentUserRole} docTag={docTag} docTagSuggestions={docTagSuggestions} pickDocTag={pickDocTag} teamDocuments={teamDocuments} handleFilePick={handleFilePick} setDraft={setDraft} setDraftIsAnnouncement={setDraftIsAnnouncement} emojiWrapperRef={emojiWrapperRef} setShowEmojiPicker={setShowEmojiPicker} showEmojiPicker={showEmojiPicker} insertEmoji={insertEmoji} textareaRef={textareaRef} draft={draft} handleDraftChange={handleDraftChange} setMention={setMention} setDocTag={setDocTag} handleSend={handleSend} sending={sending} />
        )}
      </div>

      <ImageLightbox
        src={lightboxSrc}
        alt={lightboxName}
        downloadName={lightboxName}
        onClose={() => { setLightboxSrc(null); setLightboxName(undefined); }}
      />

      {/* Read receipt viewers modal — same "viewed by" pattern as
          Announcements, scoped to a single message. */}
      <Modal
        isOpen={!!viewersMsgId}
        onClose={() => setViewersMsgId(null)}
        title={viewersMsgId ? `Seen by (${viewersForMessage(viewersMsgId).length})` : 'Seen by'}
      >
        {viewersMsgId && (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {viewersForMessage(viewersMsgId).map(v => (
              <div key={v.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
                <Avatar src={v.profilePicture} name={displayName(v, currentUserRole)} size={36} />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{displayName(v, currentUserRole)}</p>
                  <p className="text-xs text-slate-400 truncate">{v.email}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* "Who's in this channel" — team members plus every Admin (who can
          post/be reached in any channel), same list @mention suggestions
          draw from. Role badges here match the ones shown on messages. */}
      <Modal
        isOpen={showMembers}
        onClose={() => setShowMembers(false)}
        title={`${activeTeam?.name || 'Team Chat'} — Members (${mentionCandidates.length})`}
      >
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {mentionCandidates.map(p => {
            const isYou = p.email.toLowerCase() === currentUserEmail.toLowerCase();
            return (
              <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
                <Avatar src={p.profilePicture} name={displayName(p, currentUserRole)} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                    {displayName(p, currentUserRole)}
                    {isYou && <span className="text-[9px] text-slate-400 font-semibold">(You)</span>}
                  </p>
                  <p className="text-xs text-slate-400 truncate">{p.email}</p>
                </div>
                <RoleBadge role={p.role} />
              </div>
            );
          })}
          {mentionCandidates.length === 0 && (
            <EmptyState py={8} size="xs">No members in this channel yet.</EmptyState>
          )}
        </div>
      </Modal>

      {/* Forward-to-HR-&-Admin modal — one shared mechanism across all 3
          trigger points (this one for chat messages; TicketsView.tsx and
          the admin/hr dashboard announcement panels have their own local
          copy of the same note-composer + preview shape). Note is
          optional — Cancel/skip leaves it blank and Forward still works
          in one click, per the feature spec. */}
      <Modal
        isOpen={!!forwardTarget}
        onClose={() => { if (!forwarding) { setForwardTarget(null); setForwardNote(''); setForwardError(''); } }}
        title="Forward to HR & Admin"
      >
        {forwardTarget && (
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">From {forwardTarget.sourceLabel}</p>
              <p className="text-xs font-semibold text-slate-700 whitespace-pre-wrap break-words line-clamp-3">
                {forwardTarget.preview || <span className="italic text-slate-400">(no text)</span>}
              </p>
              {forwardTarget.attachmentName && (
                <p className="text-[11px] font-bold text-slate-500 mt-1.5 flex items-center gap-1">
                  <FileText className="h-3 w-3 shrink-0" /> {forwardTarget.attachmentName}
                </p>
              )}
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
                disabled={forwarding}
                onClick={() => { setForwardTarget(null); setForwardNote(''); setForwardError(''); }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={forwarding}
                onClick={submitForward}
              >
                {forwarding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {forwarding ? 'Forwarding…' : 'Forward'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
