'use client';

import React from 'react';
import { useProfiles } from '@/lib/hrData';
import { DirectMessagesView } from '@/components/ui/lazy';
import { useSessionEmail } from '@/lib/useSession';

export default function HrDirectMessagesPage() {
  const { data: allProfiles = [] } = useProfiles();
  const userEmail = useSessionEmail() || '';

  return (
    <DirectMessagesView
      allProfiles={allProfiles}
      currentUserEmail={userEmail}
      currentUserRole="hr"
    />
  );
}
