'use client';

import React from 'react';
import { useProfiles, useTeams } from '@/lib/hrData';
import { TeamChatView } from '@/components/ui/lazy';
import { ChatPage } from '@/components/ui/chat/ChatPage';
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
    <ChatPage title="Team Chat" subtitle="Message your team. Only people on the same team can see this — no personal or direct messages.">
      <TeamChatView teams={myTeams} currentUserEmail={userEmail} currentUserRole={userProfile?.role || 'employee'} allProfiles={allProfiles} />
    </ChatPage>
  );
}
