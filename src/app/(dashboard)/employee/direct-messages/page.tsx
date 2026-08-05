'use client';

import React, { useEffect, useState } from 'react';
import { useProfiles, useAllMessages, markMessageActivitySeen, Profile, Team } from '@/lib/hrData';
import { getSessionEmail } from '@/lib/session';
import { TeamChatView } from '@/components/ui/TeamChatView';

export default function EmployeeDirectMessagesPage() {
  const { data: allProfiles = [] } = useProfiles();
  const { data: allMessages = [] } = useAllMessages();
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const email = getSessionEmail() || '';
    setUserEmail(email);
    const profile = allProfiles.find(e => e.email && email && e.email.toLowerCase() === email.toLowerCase());
    if (profile) setUserProfile(profile);
  }, [allProfiles]);

  const hrTeam: Team[] = userProfile ? [{
    id: `dm_${userProfile.id}`,
    name: 'HR & Admin',
    members: [],
  }] : [];

  // Clear unread dot for the DM channel when viewing this page.
  useEffect(() => {
    if (userEmail && userProfile) {
      markMessageActivitySeen(allMessages, hrTeam.map(t => t.id), userProfile.role, userEmail);
    }
  }, [allMessages, userProfile?.id, userProfile?.role, userEmail]);

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
