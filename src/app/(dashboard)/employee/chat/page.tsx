'use client';

import React, { useEffect, useState } from 'react';
import { useProfiles, useTeams, useAllMessages, markMessageActivitySeen, Profile } from '@/lib/hrData';
import { getSessionEmail } from '@/lib/session';
import { TeamChatView } from '@/components/ui/TeamChatView';

export default function EmployeeTeamChatPage() {
  const { data: allProfiles = [] } = useProfiles();
  const { data: allTeams = [] } = useTeams();
  const { data: allMessages = [] } = useAllMessages();
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const email = getSessionEmail() || '';
    setUserEmail(email);
    const profile = allProfiles.find(e => e.email && email && e.email.toLowerCase() === email.toLowerCase());
    if (profile) setUserProfile(profile);
  }, [allProfiles]);

  // A regular member sees only the team(s) they belong to; a Team Lead also
  // sees any team they lead even if they're not formally a member of it.
  const memberTeamNames = new Set([...(userProfile?.teams || []), ...(userProfile?.leadTeams || [])]);
  const myTeams = allTeams.filter(t => memberTeamNames.has(t.name));
  const myTeamIds = myTeams.map(t => t.id);

  // Viewing this page clears the sidebar's unseen-chat dot, same pattern as
  // TicketsView. Re-runs on every poll while the page stays open, so a new
  // message that arrives in a channel you're NOT currently viewing still
  // lights the dot back up later.
  useEffect(() => {
    if (userEmail && userProfile) {
      markMessageActivitySeen(allMessages, myTeamIds, userProfile.role, userEmail);
    }
  }, [allMessages, myTeamIds.join(','), userProfile?.role, userEmail]);

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
