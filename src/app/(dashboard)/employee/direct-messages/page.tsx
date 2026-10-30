'use client';

import React from 'react';
import { useProfiles, Team } from '@/lib/hrData';
import { TeamChatView } from '@/components/ui/lazy';
import { ChatPage } from '@/components/ui/chat/ChatPage';
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
    <ChatPage title="Direct Messages" subtitle="Private conversation with HR and Admin.">
      {hrTeam.length > 0 && <TeamChatView teams={hrTeam} currentUserEmail={userEmail} currentUserRole={userProfile?.role || 'employee'} allProfiles={allProfiles} />}
    </ChatPage>
  );
}
