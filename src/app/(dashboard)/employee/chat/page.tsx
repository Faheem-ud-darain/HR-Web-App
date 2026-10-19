'use client';

import React from 'react';
import { useProfiles, useTeams } from '@/lib/hrData';
import { TeamChatView } from '@/components/ui/lazy';
import { useSessionEmail } from '@/lib/useSession';
import { useMemo } from 'react';

export default function EmployeeTeamChatPage() {
  const { data: allProfiles = [] } = useProfiles();
  const { data: allTeams = [] } = useTeams();
  const userEmail = useSessionEmail() || '';
  const userProfile = useMemo(
    () => allProfiles.find(e => e.email && userEmail && e.email.toLowerCase() === userEmail.toLowerCase()) || null,
    [allProfiles, userEmail],
  );

  // A regular member sees only the team(s) they belong to; a Team Lead also
  // sees any team they lead even if they're not formally a member of it.
  const memberTeamNames = new Set([...(userProfile?.teams || []), ...(userProfile?.leadTeams || [])]);
  const myTeams = allTeams.filter(t => memberTeamNames.has(t.name));

  return (
    // flex/h-full/min-h-0 chain (not just space-y-4) is required here — it's
    // what lets TeamChatView's own flex-1/h-full/min-h-0 actually resolve
    // against a real bounded height instead of growing forever with the
    // message list. Without it the whole page scrolled and the composer bar
    // scrolled away with it instead of staying pinned WhatsApp-style.
    <div className="flex flex-col h-full min-h-0 space-y-4">
      <div className="shrink-0 hidden md:block">
        <h1 className="text-2xl font-bold text-slate-900">Team Chat</h1>
        <p className="text-slate-500 text-sm">Message your team. Only people on the same team can see this — no personal or direct messages.</p>
      </div>
      <TeamChatView
        teams={myTeams}
        currentUserEmail={userEmail}
        currentUserRole={userProfile?.role || 'employee'}
        allProfiles={allProfiles}
      />
    </div>
  );
}
