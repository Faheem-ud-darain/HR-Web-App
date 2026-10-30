'use client';

import React, { useState, useMemo } from 'react';
import { Profile, displayName } from '@/lib/hrData';
import { TeamChatView } from './TeamChatView';
import { ChatPage } from '@/components/ui/chat/ChatPage';
import { SearchInput } from '@/components/ui/SearchInput';

interface DirectMessagesViewProps {
  allProfiles: Profile[];
  currentUserEmail: string;
  currentUserRole: 'admin' | 'hr';
}

export function DirectMessagesView({ allProfiles, currentUserEmail, currentUserRole }: DirectMessagesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter out HR and Admin users so they only message regular employees/team leads
  // (or keep everyone if they want to message each other, but typically DMs are HR<->Employee)
  const employeeProfiles = allProfiles.filter(p => p.role !== 'hr' && p.role !== 'admin');

  const filteredProfiles = useMemo(() => {
    if (!searchQuery.trim()) return employeeProfiles;
    const q = searchQuery.toLowerCase();
    return employeeProfiles.filter(p => 
      displayName(p, currentUserRole).toLowerCase().includes(q) || 
      p.email.toLowerCase().includes(q) ||
      (p.jobTitle || '').toLowerCase().includes(q)
    );
  }, [employeeProfiles, searchQuery, currentUserRole]);

  const teams = useMemo(() => {
    return filteredProfiles.map(p => ({
      id: `dm_${p.id}`,
      name: displayName(p, currentUserRole),
      members: [], // DMs don't use the members list in TeamChatView
    }));
  }, [filteredProfiles, currentUserRole]);

  if (teams.length === 0 && !searchQuery.trim()) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <p>No employees found to message.</p>
      </div>
    );
  }

  return (
    <ChatPage
      title="Direct Messages"
      subtitle="Private conversations with individual employees."
      action={<SearchInput fieldSize="md" value={searchQuery} onChange={setSearchQuery} placeholder="Search employees..." wrapperClassName="w-64" />}
    >
      {/* On a phone the title is hidden, so the search sits above the chat instead. */}
      <SearchInput fieldSize="md" value={searchQuery} onChange={setSearchQuery} placeholder="Search employees..." wrapperClassName="md:hidden shrink-0" />

      {teams.length > 0 ? (
        <TeamChatView
          teams={teams}
          currentUserEmail={currentUserEmail}
          currentUserRole={currentUserRole}
          allProfiles={allProfiles}
          oversight={false} // oversight=false because HR/Admin are legitimate participants in these DM threads
          mobileSelectorStyle="dropdown"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl text-slate-500">
          No employees match your search.
        </div>
      )}
    </ChatPage>
  );
}
