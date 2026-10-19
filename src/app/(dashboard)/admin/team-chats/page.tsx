'use client';

import React from 'react';
import { useProfiles, useTeams } from '@/lib/hrData';
import { TeamChatView } from '@/components/ui/lazy';
import { useSessionEmail } from '@/lib/useSession';

export default function AdminTeamChatsPage() {
  const { data: allProfiles = [] } = useProfiles();
  const { data: allTeams = [] } = useTeams();
  const adminEmail = useSessionEmail() || '';

  return (
    // See employee/chat/page.tsx for why this needs to be a bounded flex
    // column rather than a plain space-y-4 block — it's what makes
    // TeamChatView's composer bar stay pinned instead of scrolling away.
    <div className="flex flex-col h-full min-h-0 space-y-4">
      <div className="shrink-0 hidden md:block">
        <h1 className="text-2xl font-bold text-slate-900">Team Chats</h1>
        <p className="text-slate-500 text-sm">
          You&apos;re automatically part of every team channel and can post to any of them — your messages
          show up highlighted for everyone. Real names are always shown here, alongside each person&apos;s Alias.
        </p>
      </div>
      <TeamChatView
        teams={allTeams}
        currentUserEmail={adminEmail}
        currentUserRole="admin"
        allProfiles={allProfiles}
        oversight
      />
    </div>
  );
}
