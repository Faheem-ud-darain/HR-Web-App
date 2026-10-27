'use client';

import React from 'react';
import { FolderOpen, Megaphone, MessageCircle, SlidersHorizontal, Users } from 'lucide-react';
import type { Message } from '@/lib/hrData';
import { formatTimestamp } from './chatHelpers';

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
  const tab = (value: ChatPanel, Icon: typeof MessageCircle, label: string) => (
    <button
      onClick={() => p.onPanel(value)}
      className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md transition-colors transition-shadow ${
        p.panel === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon className="h-3 w-3" /> {label}
    </button>
  );
  const chip = 'flex items-center gap-1 text-[10px] font-bold h-7 md:h-auto px-2 py-1.5 rounded-lg transition-colors shrink-0';

  return (
    <div className="px-3 py-2 md:px-5 md:py-3.5 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between shrink-0 gap-2">
      <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-hide">
        <h3 className="font-bold text-slate-900 text-sm truncate hidden md:block shrink-0">{p.teamName}</h3>
        {p.oversight && <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mr-1 hidden sm:inline shrink-0">Viewing every channel</span>}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 mr-1 shrink-0">
          {tab('chat', MessageCircle, 'Chat')}
          {tab('documents', FolderOpen, `Documents${p.documentCount > 0 ? ` (${p.documentCount})` : ''}`)}
        </div>
        {p.panel === 'chat' && p.announcementCount > 0 && (
          <button onClick={p.onToggleAnnouncements} className={`${chip} ${p.showAnnouncements ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            <Megaphone className="h-3 w-3 shrink-0" /> {p.announcementCount}
          </button>
        )}
        {p.panel === 'chat' && (
          <button onClick={p.onShowMembers} title="See who's in this channel" className={`${chip} bg-slate-100 text-slate-500 hover:bg-slate-200`}>
            <Users className="h-3 w-3 shrink-0" /> {p.memberCount}
          </button>
        )}
      </div>

      {p.panel === 'chat' && (
        <button
          onClick={p.onToggleFilters}
          title={p.hasActiveFilters ? `Filtered (${p.filteredCount})` : 'Filter'}
          className={`flex items-center gap-1 text-[10px] font-bold h-7 w-7 md:h-auto md:w-auto md:px-2 md:py-1.5 rounded-lg transition-colors justify-center shrink-0 ${
            p.showFilters || p.hasActiveFilters ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          <SlidersHorizontal className="h-3 w-3 shrink-0" />
          <span className="hidden md:inline">{p.hasActiveFilters ? `Filtered (${p.filteredCount})` : 'Filter'}</span>
        </button>
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
          <div className="flex items-center gap-1.5 text-[9px] font-bold text-amber-700 uppercase tracking-wider">
            <Megaphone className="h-2.5 w-2.5" /> {senderLabel(a)} · {formatTimestamp(a.timestamp)}
          </div>
          {a.text && <p className="text-slate-700 font-medium mt-0.5">{a.text}</p>}
        </div>
      ))}
    </div>
  );
}
