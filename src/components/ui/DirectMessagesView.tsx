'use client';

import React, { useState, useMemo } from 'react';
import { Profile, displayName } from '@/lib/hrData';
import { TeamChatView } from './TeamChatView';
import { Search } from 'lucide-react';

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
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <p>No employees found to message.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      <div className="shrink-0 hidden md:flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Direct Messages</h1>
          <p className="text-slate-500 text-sm">Private conversations with individual employees.</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search employees..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-orange-500 outline-none"
          />
        </div>
      </div>
      
      {/* Mobile search */}
      <div className="md:hidden relative shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search employees..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-orange-500 outline-none"
        />
      </div>

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
        <div className="flex-1 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl text-slate-400">
          No employees match your search.
        </div>
      )}
    </div>
  );
}
