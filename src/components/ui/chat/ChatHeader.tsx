'use client';

import React from 'react';
import { FolderOpenIcon as FolderOpen, MegaphoneIcon as Megaphone, ChatCircleIcon as MessageCircle, SlidersHorizontalIcon as SlidersHorizontal, UsersIcon as Users } from '@/components/ui/icons';
import type { Message } from '@/lib/hrData';
import { formatTimestamp } from './chatHelpers';
import { Button } from '@/components/ui/Button';
import { IconLabelButton } from '@/components/ui/IconLabelButton';
import { Tabs, type TabItem } from '@/components/ui/Tabs';

export type ChatPanel = 'chat' | 'documents';

interface ChatHeaderProps {
  teamName: string;
  oversight: boolean;
  panel: ChatPanel;
  onPanel: (panel: ChatPanel) => void;
  documentCount: number;
  announcementCount: number;
  showAnnouncements: boolean;
  onToggleAnnouncements: () => void;
  memberCount: number;
  onShowMembers: () => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  hasActiveFilters: boolean;
  filteredCount: number;
}

// The bar above a channel: name, Chat / Documents switch, announcement and member counts, and the Filter button.
// The left group and the Filter button are separate flex children so `justify-between` has two things to split
// apart and Filter really reaches the right edge.
export function ChatHeader(p: ChatHeaderProps) {
  const panels: TabItem<ChatPanel>[] = [
    { value: 'chat', label: 'Chat', icon: <MessageCircle className="h-3.5 w-3.5" /> },
    { value: 'documents', label: `Documents${p.documentCount > 0 ? ` (${p.documentCount})` : ''}`, icon: <FolderOpen className="h-3.5 w-3.5" /> },
  ];
  const chip = 'h-7 shrink-0 md:h-auto';

  return (
    <div className="px-3 py-2 md:px-5 md:py-3.5 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between shrink-0 gap-2">
      <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-hide">
        <h2 className="font-bold text-slate-900 text-sm truncate shrink-0 max-md:sr-only">{p.teamName}</h2>
        {p.oversight && <span className="text-caption font-bold text-slate-500 uppercase tracking-wider mr-1 hidden sm:inline shrink-0">Viewing every channel</span>}
        <Tabs variant="segmented" compact value={p.panel} onChange={p.onPanel} items={panels} aria-label="Channel view" className="mr-1 shrink-0" />
        {p.panel === 'chat' && p.announcementCount > 0 && (
          <Button variant={p.showAnnouncements ? 'softAmber' : 'secondary'} size="xs" onClick={p.onToggleAnnouncements} aria-pressed={p.showAnnouncements} aria-label={`Pinned announcements (${p.announcementCount})`} className={chip}>
            <Megaphone className="h-3.5 w-3.5 shrink-0" /> {p.announcementCount}
          </Button>
        )}
        {p.panel === 'chat' && (
          <Button variant="secondary" size="xs" onClick={p.onShowMembers} title="See who's in this channel" aria-label={`Channel members (${p.memberCount})`} className={chip}>
            <Users className="h-3.5 w-3.5 shrink-0" /> {p.memberCount}
          </Button>
        )}
      </div>

      {p.panel === 'chat' && (
        <IconLabelButton
          from="md"
          variant={p.showFilters || p.hasActiveFilters ? 'softOrange' : 'secondary'}
          icon={<SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />}
          label={p.hasActiveFilters ? `Filtered (${p.filteredCount})` : 'Filter'}
          onClick={p.onToggleFilters}
          aria-pressed={p.showFilters}
          aria-label="Filter messages"
          title={p.hasActiveFilters ? `Filtered (${p.filteredCount})` : 'Filter'}
        />
      )}
    </div>
  );
}

// Announcements pinned under the header while the megaphone chip is on. Newest first.
export function PinnedAnnouncements({ announcements, senderLabel }: { announcements: Message[]; senderLabel: (m: Message) => string }) {
  return (
    <div className="border-b border-amber-200 bg-amber-50/60 max-h-40 overflow-y-auto shrink-0">
      {announcements.slice().reverse().map(a => (
        <div key={a.id} className="px-4 py-2 border-b border-amber-100 last:border-b-0 text-xs">
          <div className="flex items-center gap-1.5 text-caption font-bold text-amber-700 uppercase tracking-wider">
            <Megaphone className="h-3.5 w-3.5" /> {senderLabel(a)} · {formatTimestamp(a.timestamp)}
          </div>
          {a.text && <p className="text-slate-700 font-medium mt-0.5">{a.text}</p>}
        </div>
      ))}
    </div>
  );
}
