'use client';

import React from 'react';
import { useProfiles, Team } from '@/lib/hrData';
import { TeamChatView } from '@/components/ui/lazy';
import { useSessionEmail } from '@/lib/useSession';
import { useMemo } from 'react';

export default function EmployeeDirectMessagesPage() {
  const { data: allProfiles = [] } = useProfiles();
  const userEmail = useSessionEmail() || '';
  const userProfile = useMemo(
    () => allProfiles.find(e => e.email && userEmail && e.email.toLowerCase() === userEmail.toLowerCase()) || null,
    [allProfiles, userEmail],
  );

  const hrTeam: Team[] = userProfile ? [{
    id: `dm_${userProfile.id}`,
    name: 'HR & Admin',
    members: [],
  }] : [];

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      <div className="shrink-0 hidden md:block">
        <h1 className="text-2xl font-bold text-slate-900">Direct Messages</h1>
        <p className="text-slate-500 text-sm">Private conversation with HR and Admin.</p>
      </div>
      {hrTeam.length > 0 && (
        <TeamChatView
          teams={hrTeam}
          currentUserEmail={userEmail}
          currentUserRole={userProfile?.role || 'employee'}
          allProfiles={allProfiles}
        />
      )}
    </div>
  );
}
