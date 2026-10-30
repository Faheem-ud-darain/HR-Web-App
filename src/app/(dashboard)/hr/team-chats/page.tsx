'use client';

import React from 'react';
import { useProfiles, useTeams } from '@/lib/hrData';
import { TeamChatView } from '@/components/ui/lazy';
import { ChatPage } from '@/components/ui/chat/ChatPage';
import { useSessionEmail } from '@/lib/useSession';

export default function HrTeamChatsPage() {
  const { data: allProfiles = [] } = useProfiles();
  const { data: allTeams = [] } = useTeams();
  const hrEmail = useSessionEmail() || '';

  return (
    <ChatPage title="Team Chats" subtitle="Message any team and manage their Team Documents — onboarding guides, instructions, and reference files new members can view as soon as they're added.">
      <TeamChatView teams={allTeams} currentUserEmail={hrEmail} currentUserRole="hr" allProfiles={allProfiles} oversight />
    </ChatPage>
  );
}
