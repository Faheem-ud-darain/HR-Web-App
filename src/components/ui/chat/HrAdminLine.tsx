'use client';

import React, { useEffect } from 'react';
import { useProfiles, hrActions, HR_ADMIN_LINE_TEAM_ID } from '@/lib/hrData';
import { TeamChatView } from '@/components/ui/lazy';
import { ChatPage } from '@/components/ui/chat/ChatPage';
import { useHrAdminLineNotifications } from '@/lib/hr/notifications';
import { useSessionEmail } from '@/lib/useSession';

// A fixed, single-channel team: TeamChatView hides its channel picker when there is only one, so this is a plain chat screen.
// No hr_teams row backs it; the id MUST be HR_ADMIN_LINE_TEAM_ID since every forward and notification into this channel is
// keyed on it. It deliberately does not poll the whole message list for a sidebar dot (that is an always-on cost); the dot
// comes from the small activity feed instead, and TeamChatView polls only this channel once it is open.
const HR_ADMIN_TEAMS = [{ id: HR_ADMIN_LINE_TEAM_ID, name: 'HR & Admin', members: [] as string[] }];

// The private, permanent line between HR and Admin, the same screen for both. Opening it marks this role's line
// notifications as read, which clears the sidebar's unread dot.
export function HrAdminLine({ role }: { role: 'hr' | 'admin' }) {
  const { data: allProfiles = [] } = useProfiles();
  const { data: allNotifications = [] } = useHrAdminLineNotifications();
  const email = useSessionEmail() || '';

  useEffect(() => {
    if (!email) return;
    const relevant = allNotifications.filter(n => n.category === 'hr_admin_line' && n.recipientRole === role);
    if (relevant.length > 0) hrActions.markNotificationsAsRead(relevant, email, role).catch(() => {});
  }, [allNotifications, email, role]);

  return (
    <ChatPage title="HR & Admin" subtitle="A private, permanent line between HR and Admin — forwarded tickets, announcements, and chat messages land here too.">
      <TeamChatView teams={HR_ADMIN_TEAMS} currentUserEmail={email} currentUserRole={role} allProfiles={allProfiles} oversight={false} />
    </ChatPage>
  );
}
