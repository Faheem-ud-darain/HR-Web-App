'use client';

import React, { useEffect, useState } from 'react';
import { useProfiles, useAllMessages, markMessageActivitySeen, Profile } from '@/lib/hrData';
import { getSessionEmail } from '@/lib/session';
import { DirectMessagesView } from '@/components/ui/DirectMessagesView';

export default function AdminDirectMessagesPage() {
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

  const employeeProfiles = allProfiles.filter(p => p.role !== 'hr' && p.role !== 'admin');
  const dmTeamIds = employeeProfiles.map(p => `dm_${p.id}`);

  // Clear unread dot for all DM channels when viewing this page.
  useEffect(() => {
    if (userEmail && userProfile) {
      markMessageActivitySeen(allMessages, dmTeamIds, userProfile.role, userEmail);
    }
  }, [allMessages, dmTeamIds.join(','), userProfile?.role, userEmail]);

  return (
    <DirectMessagesView
      allProfiles={allProfiles}
      currentUserEmail={userEmail}
      currentUserRole="admin"
    />
  );
}
