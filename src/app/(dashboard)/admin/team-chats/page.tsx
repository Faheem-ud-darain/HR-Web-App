'use client';

import React from 'react';
import { useProfiles, useTeams } from '@/lib/hrData';
import { TeamChatView } from '@/components/ui/lazy';
import { ChatPage } from '@/components/ui/chat/ChatPage';
import { useSessionEmail } from '@/lib/useSession';

export default function AdminTeamChatsPage() {
  const { data: allProfiles = [] } = useProfiles();
  const { data: allTeams = [] } = useTeams();
  const adminEmail = useSessionEmail() || '';

  return (
    <ChatPage title="Team Chats" subtitle="You're automatically part of every team channel and can post to any of them — your messages show up highlighted for everyone. Real names are always shown here, alongside each person's Alias.">
      <TeamChatView teams={allTeams} currentUserEmail={adminEmail} currentUserRole="admin" allProfiles={allProfiles} oversight />
    </ChatPage>
  );
}
