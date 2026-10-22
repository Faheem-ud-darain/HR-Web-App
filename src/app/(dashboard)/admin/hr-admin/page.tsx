'use client';

import React, { useEffect } from 'react';
import { useProfiles, hrActions, HR_ADMIN_LINE_TEAM_ID } from '@/lib/hrData';
import { TeamChatView } from '@/components/ui/lazy';
import { useHrAdminLineNotifications } from '@/lib/hr/notifications';
import { useSessionEmail } from '@/lib/useSession';

// See the identical comment block in hr/hr-admin/page.tsx — same fixed
// synthetic single-channel team, same deliberate avoidance of
// the sidebar dot's activity feed.
const HR_ADMIN_TEAMS = [{ id: HR_ADMIN_LINE_TEAM_ID, name: 'HR & Admin', members: [] as string[] }];

export default function AdminHrAdminPage() {
  const { data: allProfiles = [] } = useProfiles();
  const { data: allNotifications = [] } = useHrAdminLineNotifications();
  const adminEmail = useSessionEmail() || '';

  useEffect(() => {
    if (!adminEmail) return;
    const relevant = allNotifications.filter(n => n.category === 'hr_admin_line' && n.recipientRole === 'admin');
    if (relevant.length > 0) hrActions.markNotificationsAsRead(relevant, adminEmail, 'admin').catch(() => {});
  }, [allNotifications, adminEmail]);

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      <div className="shrink-0 hidden md:block">
        <h1 className="text-2xl font-bold text-slate-900">HR & Admin</h1>
        <p className="text-slate-500 text-sm">
          A private, permanent line between HR and Admin — forwarded tickets, announcements, and chat
          messages land here too.
        </p>
      </div>
      <TeamChatView
        teams={HR_ADMIN_TEAMS}
        currentUserEmail={adminEmail}
        currentUserRole="admin"
        allProfiles={allProfiles}
        oversight={false}
      />
    </div>
  );
}
