'use client';

import React, { useEffect } from 'react';
import { Profile } from '@/lib/hrData';
import { Avatar } from '@/components/ui/Avatar';
import { Crown, Headset, Star } from 'lucide-react';
import { formatTimeNY, formatShortDateNY, getNYDateString } from '@/lib/timezone';
import { safeHref } from '@/lib/sanitize';

// Curated, no-dependency emoji set for the composer's emoji picker — avoids
// pulling in an emoji-picker package (and its bundle size / build-tool
// dependency) just for this. Grouped loosely so the picker doesn't read as
// a random wall of glyphs; browsers/OSes render these as native emoji, no
// image assets needed.
export const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Smileys', emojis: ['😀', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🙃', '😍', '🥰', '😘', '😜', '🤔', '🤨', '😐', '😑', '😴', '🥱', '😷', '🤒'] },
  { label: 'Gestures', emojis: ['👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '✌️', '🤞', '👌', '👋', '🤙', '✋'] },
  { label: 'Hearts', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💯', '✨', '🔥', '⭐'] },
  { label: 'Work', emojis: ['✅', '❌', '⚠️', '📌', '📎', '📅', '⏰', '💼', '📈', '📉', '💰', '🎯', '🚀', '🛠️', '📝', '📦', '🚚', '☕'] },
  { label: 'Reactions', emojis: ['🎉', '👀', '💡', '🙌', '😢', '😡', '😮', '🤝', '👏', '🥳'] },
];

export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
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
export function ReadReceiptFacepile({ viewers, onOpen }: { viewers: Profile[]; onOpen: () => void }) {
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
export type RoleBadgeInfo = { label: string; icon: React.ComponentType<{ className?: string }>; text: string; bg: string };

export function roleBadgeInfo(role?: string): RoleBadgeInfo | null {
  if (role === 'admin') return { label: 'Admin', icon: Crown, text: 'text-purple-700', bg: 'bg-purple-100' };
  if (role === 'hr') return { label: 'HR', icon: Headset, text: 'text-sky-700', bg: 'bg-sky-100' };
  if (role === 'team_lead') return { label: 'Team Lead', icon: Star, text: 'text-amber-700', bg: 'bg-amber-100' };
  return null;
}

export function RoleBadge({ role, className = '' }: { role?: string; className?: string }) {
  const info = roleBadgeInfo(role);
  if (!info) return null;
  const Icon = info.icon;
  return (
    <span className={`flex items-center gap-0.5 ${info.bg} ${info.text} text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0 ${className}`}>
      <Icon className="h-2.5 w-2.5" /> {info.label}
    </span>
  );
}

export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

 // matches the collection's new maxSize

export function formatTimestamp(iso: string): string {
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

export function isImageAttachment(name?: string): boolean {
  if (!name) return false;
  return /\.(png|jpe?g|gif|webp)$/i.test(name);
}

export type FileTypeFilter = 'all' | 'image' | 'document' | 'other' | 'none' | 'announcement';

export type SizeFilter = 'all' | 'small' | 'medium' | 'large';

export function attachmentKind(name?: string): 'image' | 'document' | 'other' | 'none' {
  if (!name) return 'none';
  if (isImageAttachment(name)) return 'image';
  if (/\.(pdf|docx?|xlsx?|txt)$/i.test(name)) return 'document';
  return 'other';
}

export function formatBytes(bytes?: number): string {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Small (<1MB) / Medium (1-5MB) / Large (>5MB) — coarse buckets, matches
// the sizes people actually think in rather than exact byte ranges.
export function sizeBucket(bytes?: number): SizeFilter {
  if (!bytes && bytes !== 0) return 'all';
  if (bytes < 1024 * 1024) return 'small';
  if (bytes < 5 * 1024 * 1024) return 'medium';
  return 'large';
}

// Display tag for a forwarded message's card — see the "Forward" action
// on tickets/announcements/chat messages (hrActions.forwardToHrAdminLine
// in hrData.ts) and the m.isForward rendering branch below.
export const FORWARD_KIND_LABEL: Record<'ticket' | 'announcement' | 'chat', string> = {
  ticket: 'Forwarded → Ticket',
  announcement: 'Forwarded → Announcement',
  chat: 'Forwarded → Message' };

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Highlights "@Display Name" mentions AND "#Document Title" tags in message
// text. Doc tags are matched against whichever documents currently exist
// for this team (same "resolve live, don't trust the snapshot" approach as
// mentions) and render as clickable links straight to the file — that's
// the "tag a document to ask questions about it" feature: typing #Title in
// chat both highlights it and opens the doc for anyone reading the thread.
export function renderMessageText(
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
        <a key={i} href={safeHref(docUrl)} target="_blank" rel="noreferrer" className={docClass}>
          {part}
        </a>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
