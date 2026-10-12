'use client';

import React, { useEffect, useState } from 'react';
import { useProfiles, useTeams, useAllMessages, markMessageActivitySeen } from '@/lib/hrData';
import { getSessionEmail } from '@/lib/session';
import { TeamChatView } from '@/components/ui/lazy';

export default function HrTeamChatsPage() {
  const { data: allProfiles = [] } = useProfiles();
  const { data: allTeams = [] } = useTeams();
  const { data: allMessages = [] } = useAllMessages();
  const [hrEmail, setHrEmail] = useState('');

  useEffect(() => {
    setHrEmail(getSessionEmail() || '');
  }, []);

  // Same "oversight" treatment as Admin's Team Chats page — HR can see and
  // post in every team's channel, and can upload Team Documents for any
  // team (onboarding material isn't limited to whichever team HR happens
  // to be a formal member of).
  useEffect(() => {
    if (hrEmail) markMessageActivitySeen(allMessages, 'all', 'hr', hrEmail);
  }, [allMessages, hrEmail]);

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      <div className="shrink-0 hidden md:block">
        <h1 className="text-2xl font-bold text-slate-900">Team Chats</h1>
        <p className="text-slate-500 text-sm">
          Message any team and manage their Team Documents — onboarding guides, instructions, and reference
          files new members can view as soon as they're added.
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
