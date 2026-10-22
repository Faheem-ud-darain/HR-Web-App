'use client';

import React from 'react';
import { useProfiles, useTeams } from '@/lib/hrData';
import { TeamChatView } from '@/components/ui/lazy';
import { useSessionEmail } from '@/lib/useSession';

export default function HrTeamChatsPage() {
  const { data: allProfiles = [] } = useProfiles();
  const { data: allTeams = [] } = useTeams();
  const hrEmail = useSessionEmail() || '';

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      <div className="shrink-0 hidden md:block">
        <h1 className="text-2xl font-bold text-slate-900">Team Chats</h1>
        <p className="text-slate-500 text-sm">
          Message any team and manage their Team Documents — onboarding guides, instructions, and reference
          files new members can view as soon as they&apos;re added.
        </p>
      </div>
      <TeamChatView
        teams={allTeams}
        currentUserEmail={hrEmail}
        currentUserRole="hr"
        allProfiles={allProfiles}
        oversight
      />
    </div>
  );
}
