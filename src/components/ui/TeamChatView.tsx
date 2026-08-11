'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Team, Profile, Message, useMessages, useTeamDocuments, hrActions, displayName, buildNotificationLink } from '@/lib/hrData';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { TeamDocumentsPanel } from './TeamDocumentsPanel';
import { TypingIndicator } from './TypingIndicator';
import { Send, Paperclip, FileText, Download, ShieldCheck, Loader2, Crown, Search, SlidersHorizontal, X, Megaphone, MessageCircle, FolderOpen, Smile, Users, Headset, Star, Video } from 'lucide-react';
import { ImageLightbox } from './ImageLightbox';
import { OptimizedImage } from './OptimizedImage';
import { isNativeMobileApp } from '@/lib/trackerSetup';
import { formatTimeNY, formatShortDateNY, getNYDateString } from '@/lib/timezone';

// Curated, no-dependency emoji set for the composer's emoji picker — avoids
// pulling in an emoji-picker package (and its bundle size / build-tool
// dependency) just for this. Grouped loosely so the picker doesn't read as
// a random wall of glyphs; browsers/OSes render these as native emoji, no
// image assets needed.
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Smileys', emojis: ['😀', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🙃', '😍', '🥰', '😘', '😜', '🤔', '🤨', '😐', '😑', '😴', '🥱', '😷', '🤒'] },
  { label: 'Gestures', emojis: ['👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '✌️', '🤞', '👌', '👋', '🤙', '✋'] },
  { label: 'Hearts', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💯', '✨', '🔥', '⭐'] },
  { label: 'Work', emojis: ['✅', '❌', '⚠️', '📌', '📎', '📅', '⏰', '💼', '📈', '📉', '💰', '🎯', '🚀', '🛠️', '📝', '📦', '🚚', '☕'] },
  { label: 'Reactions', emojis: ['🎉', '👀', '💡', '🙌', '😢', '😡', '😮', '🤝', '👏', '🥳'] },
];

function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  // Only Escape is handled here. Outside-click is handled one level up by
  // the toggle button's own wrapper (see emojiWrapperRef below) — doing it
  // here too would race with the toggle button's onClick: mousedown closes
  // the picker first, then the button's click re-opens it, so the button
  // would appear to do nothing when clicked while the picker is open.
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div
      className="absolute bottom-full left-0 mb-1 w-64 max-w-[calc(100vw-2rem)] max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg z-20 p-2.5 space-y-2"
    >
      {EMOJI_GROUPS.map(group => (
        <div key={group.label}>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-0.5 mb-1">{group.label}</p>
          <div className="grid grid-cols-8 gap-0.5">
            {group.emojis.map(emoji => (
              <button
                key={emoji}
                type="button"
                onMouseDown={e => { e.preventDefault(); onPick(emoji); }}
                className="text-lg leading-none p-1 rounded-lg hover:bg-slate-100 transition-colors active:scale-90"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Tiny "announcement styled" read receipt for a single message — a small
// overlapping avatar facepile plus a count, tucked right under the bubble.
// Renders nothing until at least one other person has actually viewed the
// message (no dashed-placeholder state here, unlike the Announcements
// panel's version — that would put a "0 viewed" line under every single
// chat message, which is exactly the UI clutter this was asked to avoid).
function ReadReceiptFacepile({ viewers, onOpen }: { viewers: Profile[]; onOpen: () => void }) {
  if (viewers.length === 0) return null;
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-1 mt-1 group"
      title="See who has viewed this message"
    >
      <div className="flex -space-x-1.5">
        {viewers.slice(0, 3).map(v => (
          <Avatar key={v.id} src={v.profilePicture} name={v.fullName} size={13} className="ring-1 ring-white" />
        ))}
      </div>
      <span className="text-[8px] font-bold text-slate-400 group-hover:text-orange-600 transition-colors">
        Seen{viewers.length > 3 ? ` by ${viewers.length}` : ''}
      </span>
    </button>
  );
}

// Small role badge shown next to a name — used both in the Members panel
// and (for HR/Team Lead) next to a sender's name on their messages, so
// anyone reading the channel can immediately tell who's HR/Admin/a Team
// Lead vs. a regular employee. Admin already had its own purple+Crown
// treatment on messages (see isAdminSender below, kept as-is since it also
// recolors the whole bubble); this covers the two roles that previously had
// no visual distinction at all. Returns null for a plain employee — no
// badge needed there.
type RoleBadgeInfo = { label: string; icon: React.ComponentType<{ className?: string }>; text: string; bg: string };
function roleBadgeInfo(role?: string): RoleBadgeInfo | null {
  if (role === 'admin') return { label: 'Admin', icon: Crown, text: 'text-purple-700', bg: 'bg-purple-100' };
  if (role === 'hr') return { label: 'HR', icon: Headset, text: 'text-sky-700', bg: 'bg-sky-100' };
  if (role === 'team_lead') return { label: 'Team Lead', icon: Star, text: 'text-amber-700', bg: 'bg-amber-100' };
  return null;
}
function RoleBadge({ role, className = '' }: { role?: string; className?: string }) {
  const info = roleBadgeInfo(role);
  if (!info) return null;
  const Icon = info.icon;
  return (
    <span className={`flex items-center gap-0.5 ${info.bg} ${info.text} text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0 ${className}`}>
      <Icon className="h-2.5 w-2.5" /> {info.label}
    </span>
  );
}

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

const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024; // matches the collection's new maxSize

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    // "Today" is judged in America/New_York, not the device's local
    // timezone — every clock in the app is fixed to that one timezone, see
    // src/lib/timezone.ts.
    const sameDay = getNYDateString(d) === getNYDateString(new Date());
    const time = formatTimeNY(d);
    return sameDay ? time : `${formatShortDateNY(d)} · ${time}`;
  } catch {
    return iso;
  }
}

function isImageAttachment(name?: string): boolean {
  if (!name) return false;
  return /\.(png|jpe?g|gif|webp)$/i.test(name);
}

type FileTypeFilter = 'all' | 'image' | 'document' | 'other' | 'none' | 'announcement';
type SizeFilter = 'all' | 'small' | 'medium' | 'large';

function attachmentKind(name?: string): 'image' | 'document' | 'other' | 'none' {
  if (!name) return 'none';
  if (isImageAttachment(name)) return 'image';
  if (/\.(pdf|docx?|xlsx?|txt)$/i.test(name)) return 'document';
  return 'other';
}

function formatBytes(bytes?: number): string {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Small (<1MB) / Medium (1-5MB) / Large (>5MB) — coarse buckets, matches
// the sizes people actually think in rather than exact byte ranges.
function sizeBucket(bytes?: number): SizeFilter {
  if (!bytes && bytes !== 0) return 'all';
  if (bytes < 1024 * 1024) return 'small';
  if (bytes < 5 * 1024 * 1024) return 'medium';
  return 'large';
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Highlights "@Display Name" mentions AND "#Document Title" tags in message
// text. Doc tags are matched against whichever documents currently exist
// for this team (same "resolve live, don't trust the snapshot" approach as
// mentions) and render as clickable links straight to the file — that's
// the "tag a document to ask questions about it" feature: typing #Title in
// chat both highlights it and opens the doc for anyone reading the thread.
function renderMessageText(
  text: string,
  mentionLabels: string[],
  docTags: { title: string; url: string }[],
  onColoredBubble: boolean
): React.ReactNode {
  if (!text) return null;
  const mentionSet = new Set(mentionLabels.map(l => `@${l}`));
  const docByTag = new Map(docTags.map(d => [`#${d.title}`, d.url]));
  if (mentionSet.size === 0 && docByTag.size === 0) return text;

  const mentionAlt = [...mentionLabels].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const docAlt = docTags.map(d => d.title).sort((a, b) => b.length - a.length).map(escapeRegExp);
  const patterns = [
    ...(mentionAlt.length ? [`@(?:${mentionAlt.join('|')})`] : []),
    ...(docAlt.length ? [`#(?:${docAlt.join('|')})`] : []),
  ];
  const re = new RegExp(`(${patterns.join('|')})`, 'g');
  const parts = text.split(re);
  const mentionClass = onColoredBubble
    ? 'font-bold bg-white/25 rounded px-1'
    : 'font-bold text-orange-700 bg-orange-100 rounded px-1';
  const docClass = onColoredBubble
    ? 'font-bold bg-white/25 rounded px-1 underline underline-offset-2 cursor-pointer'
    : 'font-bold text-sky-700 bg-sky-100 rounded px-1 underline underline-offset-2 cursor-pointer';
  return parts.map((part, i) => {
    if (mentionSet.has(part)) return <span key={i} className={mentionClass}>{part}</span>;
    const docUrl = docByTag.get(part);
    if (docUrl) {
      return (
        <a key={i} href={docUrl} target="_blank" rel="noreferrer" className={docClass}>
          {part}
        </a>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

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
  // Small "announcement styled" read receipts — see hrActions.getMessageReadMap
  // / markMessagesSeen in hrData.ts. Kept deliberately tiny (see the facepile
  // JSX below) so it reads as a subtle detail under your own messages, not a
  // second UI competing with the chat itself.
  const [messageReadMap, setMessageReadMap] = useState<Record<string, string[]>>({});
  const [viewersMsgId, setViewersMsgId] = useState<string | null>(null);
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

  // Reset windowing limit when switching active team
  useEffect(() => {
    setMessageLimit(50);
  }, [activeTeamId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, activeTeamId, typingNames.length]);

  // Fetch the read-receipt map for whatever's currently on screen, and mark
  // it as seen by the current viewer — same "seen on arrival" pattern as
  // Announcements, just scoped to one channel's currently-loaded messages
  // rather than the whole list.
  useEffect(() => {
    if (!activeTeamId || messages.length === 0 || !currentUserEmail) return;
    hrActions.getMessageReadMap().then(setMessageReadMap);
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
    hrActions.getMessageReadMap().then(setMessageReadMap);
  };

  // Reset search/filter state when switching teams — a filter set up for
  // one channel isn't necessarily meaningful in another.
  useEffect(() => {
    setSearchQuery(''); setDateFrom(''); setDateTo('');
    setFileTypeFilter('all'); setSizeFilter('all'); setShowFilters(false);
  }, [activeTeamId]);

  // Reset the composer's mention state when switching teams so a stale
  // dropdown/selection from one channel can't bleed into another.
  useEffect(() => {
    setMention(null);
    setMentionedProfiles(new Map());
    setDocTag(null);
    setShowEmojiPicker(false);
  }, [activeTeamId]);

  // "X is typing…" — poll everyone else's typing state for the active
  // channel every 2s (short enough that the indicator feels live, long
  // enough not to hammer the KV collection). Also clears this device's own
  // typing marker whenever the channel changes, so switching teams mid-type
  // doesn't leave a stale "typing…" showing in the channel just left.
  useEffect(() => {
    setTypingNames([]);
    if (!activeTeamId || !currentUserEmail) return;
    let cancelled = false;
    const poll = () => {
      hrActions.getTypingUsers('chat', activeTeamId, currentUserEmail).then(rows => {
        if (!cancelled) setTypingNames(rows.map(r => r.displayName));
      }).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
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
          <select
            value={activeTeamId || ''}
            onChange={(e) => setActiveTeamId(e.target.value)}
            className="w-full bg-slate-100 border-none text-slate-700 text-sm font-bold rounded-xl px-4 py-3 appearance-none outline-none focus:ring-2 focus:ring-orange-500/50"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%2364748b\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 1rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1rem' }}
          >
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
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
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search messages, senders, or file names…"
                className="w-full bg-white border border-slate-200 rounded-lg py-2 pl-8 pr-3 text-xs outline-none focus:border-orange-500 font-medium"
              />
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-[10px] font-semibold outline-none focus:border-orange-500" />
              <span className="text-[10px] text-slate-400 font-bold">to</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-[10px] font-semibold outline-none focus:border-orange-500" />

              <select value={fileTypeFilter} onChange={e => setFileTypeFilter(e.target.value as FileTypeFilter)} className="bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-[10px] font-bold outline-none focus:border-orange-500">
                <option value="all">All types</option>
                <option value="image">Images</option>
                <option value="document">Documents</option>
                <option value="other">Other files</option>
                <option value="none">Text only</option>
                <option value="announcement">Announcements</option>
              </select>

              <select value={sizeFilter} onChange={e => setSizeFilter(e.target.value as SizeFilter)} className="bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-[10px] font-bold outline-none focus:border-orange-500">
                <option value="all">Any size</option>
                <option value="small">Small (&lt;1MB)</option>
                <option value="medium">Medium (1–5MB)</option>
                <option value="large">Large (&gt;5MB)</option>
              </select>

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
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
          {messages.length >= messageLimit && (
            <div className="text-center py-2">
              <button
                onClick={() => setMessageLimit(prev => prev + 50)}
                className="text-[11px] font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-full transition-colors"
              >
                Load earlier messages
              </button>
            </div>
          )}
          {isLoading && <p className="text-xs text-slate-400 text-center font-semibold py-6">Loading messages…</p>}
          {!isLoading && messages.length === 0 && (
            <p className="text-xs text-slate-400 text-center font-semibold py-6 italic">No messages yet — say hi 👋</p>
          )}
          {!isLoading && messages.length > 0 && filteredMessages.length === 0 && (
            <p className="text-xs text-slate-400 text-center font-semibold py-6 italic">No messages match your search/filters.</p>
          )}
          {filteredMessages.map(m => {
            const isSelf = m.senderEmail.toLowerCase() === currentUserEmail.toLowerCase();
            const label = senderLabel(m);
            // Admin is auto-a-member of every team channel and can post
            // anywhere — their messages get a distinct highlighted look
            // (purple + crown badge) in every viewer's chat, self or not,
            // so they're unmistakable next to regular team messages.
            const senderRole = emailToProfile.get(normEmail(m.senderEmail))?.role;
            const isAdminSender = senderRole === 'admin';

            // Announcements render full-width and pinned-banner styled,
            // not as a left/right chat bubble — they're meant to stand out
            // from the regular back-and-forth, not blend into it.
            if (m.isAnnouncement) {
              return (
                <div key={m.id} className="border-2 border-amber-300 bg-amber-50 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1">
                    <Megaphone className="h-3.5 w-3.5" /> Announcement · {label}
                    {isAdminSender ? <Crown className="h-3 w-3 text-purple-600" /> : <RoleBadge role={senderRole} />}
                    <span className="text-slate-400 font-semibold normal-case ml-auto">{formatTimestamp(m.timestamp)}</span>
                  </div>
                  {m.text && (
                    <p className="text-xs font-semibold text-slate-800 whitespace-pre-wrap break-words">
                      {renderMessageText(m.text, mentionLabels, docTagList, false)}
                    </p>
                  )}
                  {m.attachmentUrl && (
                    isImageAttachment(m.attachmentName) ? (
                      <button
                        type="button"
                        onClick={() => { setLightboxSrc(m.attachmentUrl!); setLightboxName(m.attachmentName); }}
                        className={m.text ? 'block mt-2' : 'block'}
                      >
                        <OptimizedImage
                          src={m.attachmentUrl}
                          alt={m.attachmentName || 'attachment'}
                          width={400}
                          height={220}
                          className="rounded-lg max-h-56 object-cover"
                        />
                      </button>
                    ) : (
                      <a href={m.attachmentUrl} target="_blank" rel="noreferrer" className={`flex items-center gap-1.5 text-[11px] font-bold underline text-amber-700 ${m.text ? 'mt-2' : ''}`}>
                        <FileText className="h-3.5 w-3.5 shrink-0" /> {m.attachmentName || 'Attachment'} <Download className="h-3 w-3 shrink-0" />
                      </a>
                    )
                  )}
                  {isSelf && <ReadReceiptFacepile viewers={viewersForMessage(m.id)} onOpen={() => openMessageViewers(m.id)} />}
                </div>
              );
            }

            return (
              <div key={m.id} className={`flex gap-2 ${isSelf ? 'flex-row-reverse' : ''}`}>
                <Avatar src={emailToProfile.get(normEmail(m.senderEmail))?.profilePicture} name={label} size={28} />
                <div className={`max-w-[75%] flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-[10px] font-bold ${isAdminSender ? 'text-purple-700' : 'text-slate-600'}`}>{label}</span>
                    {isAdminSender ? (
                      <span className="flex items-center gap-0.5 bg-purple-100 text-purple-700 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full">
                        <Crown className="h-2.5 w-2.5" /> Admin
                      </span>
                    ) : (
                      <RoleBadge role={senderRole} />
                    )}
                    <span className="text-[9px] text-slate-400 font-semibold">{formatTimestamp(m.timestamp)}</span>
                  </div>
                  <div className={`rounded-2xl px-3.5 py-2.5 text-xs font-medium leading-relaxed ${
                    isAdminSender
                      ? 'bg-purple-600 text-white ring-2 ring-purple-200 ' + (isSelf ? 'rounded-tr-sm' : 'rounded-tl-sm')
                      : isSelf ? 'bg-orange-600 text-white rounded-tr-sm' : 'bg-slate-100 text-slate-800 rounded-tl-sm'
                  }`}>
                    {m.text && (
                      <p className="whitespace-pre-wrap break-words">
                        {renderMessageText(m.text, mentionLabels, docTagList, isAdminSender || isSelf)}
                      </p>
                    )}
                    {m.attachmentUrl && (
                      isImageAttachment(m.attachmentName) ? (
                        <button
                          type="button"
                          onClick={() => { setLightboxSrc(m.attachmentUrl!); setLightboxName(m.attachmentName); }}
                          className={m.text ? 'block mt-2' : 'block'}
                        >
                          <OptimizedImage
                            src={m.attachmentUrl}
                            alt={m.attachmentName || 'attachment'}
                            width={400}
                            height={220}
                            className="rounded-lg max-h-56 object-cover"
                          />
                        </button>
                      ) : (
                        <a
                          href={m.attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={`flex items-center gap-1.5 text-[11px] font-bold underline ${m.text ? 'mt-2' : ''} ${isAdminSender || isSelf ? 'text-white' : 'text-orange-700'}`}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" /> {m.attachmentName || 'Attachment'}
                          {m.attachmentSize !== undefined && <span className="font-semibold opacity-80">({formatBytes(m.attachmentSize)})</span>}
                          <Download className="h-3 w-3 shrink-0" />
                        </a>
                      )
                    )}
                  </div>
                  {isSelf && <ReadReceiptFacepile viewers={viewersForMessage(m.id)} onOpen={() => openMessageViewers(m.id)} />}
                </div>
              </div>
            );
          })}
          <TypingIndicator names={typingNames} />
        </div>
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
          <div className="border-t border-slate-200 px-2 md:px-3 pt-2 md:pt-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:pb-[calc(0.75rem+env(safe-area-inset-bottom))] shrink-0 relative bg-white">
            {oversight && (
              <p className="text-[9px] text-purple-600 font-bold mb-2 flex items-center gap-1"><Crown className="h-3 w-3" /> Posting as Admin — this message will be highlighted for everyone in {activeTeam?.name || 'this team'}.</p>
            )}
            {draftIsAnnouncement && (
              <p className="text-[9px] text-amber-700 font-bold mb-2 flex items-center gap-1"><Megaphone className="h-3 w-3" /> Sending as a pinned Announcement — everyone in {activeTeam?.name || 'this team'} will see it highlighted at the top.</p>
            )}
            {sendError && <p className="text-[10px] text-rose-600 font-bold mb-1.5 px-1">{sendError}</p>}
            {pendingFile && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 mb-2 text-[10px] font-bold text-slate-600">
                <Paperclip className="h-3 w-3" /> {pendingFile.name}
                <button onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="ml-auto text-slate-400 hover:text-rose-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* @mention suggestion dropdown */}
            {mention && mentionSuggestions.length > 0 && (
              <div className="absolute bottom-full left-3 mb-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-10">
                {mentionSuggestions.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); pickMention(p); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-50 transition-colors"
                  >
                    <Avatar src={p.profilePicture} name={displayName(p, currentUserRole)} size={22} />
                    <span className="text-xs font-bold text-slate-800 truncate">{displayName(p, currentUserRole)}</span>
                    {p.role === 'admin' && <Crown className="h-3 w-3 text-purple-600 ml-auto shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            {/* "#" document-tag suggestion dropdown */}
            {docTag && docTagSuggestions.length > 0 && (
              <div className="absolute bottom-full left-3 mb-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-10">
                {docTagSuggestions.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); pickDocTag(d); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-sky-50 transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                    <span className="text-xs font-bold text-slate-800 truncate">{d.title}</span>
                  </button>
                ))}
              </div>
            )}
            {docTag && docTagSuggestions.length === 0 && teamDocuments.length === 0 && (
              <div className="absolute bottom-full left-3 mb-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-10 px-3 py-2">
                <span className="text-[10px] text-slate-400 font-semibold">No documents in this team yet.</span>
              </div>
            )}

            <div className="flex items-center gap-1.5 md:gap-2">
              <label className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 cursor-pointer transition-colors shrink-0 flex items-center justify-center" title="Attach file">
                <Paperclip className="h-4 w-4" />
                <input ref={fileInputRef} type="file" className="hidden" onChange={e => handleFilePick(e.target.files?.[0])} />
              </label>

              <button
                type="button"
                onClick={() => {
                  const meetLink = 'https://meet.google.com/new';
                  const title = `🎥 Google Meet Video Room\nClick to join video call: ${meetLink}`;
                  setDraft(prev => prev ? `${prev}\n${title}` : title);
                }}
                title="Create Google Meet Video Call"
                className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 flex items-center justify-center transition-colors shrink-0"
              >
                <Video className="h-4 w-4" />
              </button>
              
              {oversight && (
                <button
                  type="button"
                  onClick={() => setDraftIsAnnouncement(v => !v)}
                  title="Send as Announcement"
                  className={`h-8 w-8 md:h-9 md:w-9 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                    draftIsAnnouncement ? 'bg-amber-500 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'
                  }`}
                >
                  <Megaphone className="h-4 w-4" />
                </button>
              )}

              <div className="relative flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-3xl pl-1 pr-3">
                <div ref={emojiWrapperRef} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(v => !v)}
                    title="Insert emoji"
                    className={`p-2 rounded-full transition-colors flex items-center justify-center ${
                      showEmojiPicker ? 'text-orange-600' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <Smile className="h-4 w-4" />
                  </button>
                  {showEmojiPicker && (
                    <div className="absolute bottom-full left-0 mb-2">
                      <EmojiPicker onPick={insertEmoji} onClose={() => setShowEmojiPicker(false)} />
                    </div>
                  )}
                </div>
                
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={handleDraftChange}
                  onKeyDown={e => {
                    if (mention && mentionSuggestions.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) {
                      e.preventDefault();
                      pickMention(mentionSuggestions[0]);
                      return;
                    }
                    if (mention && e.key === 'Escape') {
                      e.preventDefault();
                      setMention(null);
                      return;
                    }
                    if (docTag && docTagSuggestions.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) {
                      e.preventDefault();
                      pickDocTag(docTagSuggestions[0]);
                      return;
                    }
                    if (docTag && e.key === 'Escape') {
                      e.preventDefault();
                      setDocTag(null);
                      return;
                    }
                    // Same reasoning as TicketsView's reply box: on the native
                    // mobile app the keyboard's Enter/Return key should only
                    // ever insert a newline (there's no Shift key on a phone),
                    // so gate the "Enter sends" shortcut to desktop web only.
                    if (e.key === 'Enter' && !e.shiftKey && !isNativeMobileApp()) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={draftIsAnnouncement ? 'Announcement…' : 'Message… (@ to mention)'}
                  rows={1}
                  className="flex-1 bg-transparent py-2 md:py-2.5 px-1 text-[10px] md:text-[11px] outline-none font-medium resize-none max-h-24 min-h-8 md:min-h-9 w-full"
                />
              </div>

              <button
                onClick={handleSend}
                disabled={sending || (!draft.trim() && !pendingFile)}
                className={`h-8 w-8 md:h-9 md:w-9 rounded-full flex items-center justify-center disabled:opacity-50 text-white transition-colors transition-transform active:scale-95 shrink-0 ${
                  draftIsAnnouncement ? 'bg-amber-500 hover:bg-amber-600' : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
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
            <p className="text-center py-8 text-slate-400 font-semibold text-xs italic">No members in this channel yet.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
