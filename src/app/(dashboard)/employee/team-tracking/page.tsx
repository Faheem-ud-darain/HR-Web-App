'use client';

import React, { useState, useEffect } from 'react';
import { useProfiles, Profile } from '@/lib/hrData';
import { getSessionEmail } from '@/lib/session';
import { TrackingView } from '@/components/ui/lazy';
import { Users } from 'lucide-react';

// Read-only tracking view (screenshots + mouse-activity) scoped to a Team
// Lead's own teammates. TrackingView itself enforces the "view only, never
// change settings" rule via its canManage gating (role='team_lead') — this
// page just guards the route and passes the viewer's email down so it can
// resolve which team(s) to scope to.
export default function TeamLeadTrackingPage() {
  const { data: allProfiles = [] } = useProfiles();
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const email = getSessionEmail() || '';
    setUserEmail(email);
    const profile = allProfiles.find(e => e.email && email && e.email.toLowerCase() === email.toLowerCase());
    if (profile) setUserProfile(profile);
  }, [allProfiles]);

  if (!userProfile?.isTeamLead) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
        <Users className="h-12 w-12 opacity-30" />
        <p className="font-semibold text-sm">You are not designated as a Team Lead.</p>
        <p className="text-xs">Contact HR to update your role.</p>
      </div>
    );
  }

  return <TrackingView role="team_lead" viewerEmail={userEmail} />;
}
