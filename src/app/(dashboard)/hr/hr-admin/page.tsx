'use client';

import React, { useEffect, useState } from 'react';
import { useProfiles, useNotifications, hrActions, HR_ADMIN_LINE_TEAM_ID } from '@/lib/hrData';
import { getSessionEmail } from '@/lib/session';
import { TeamChatView } from '@/components/ui/TeamChatView';

// Fixed, single-channel team array — TeamChatView auto-hides its team
// selector whenever there's only one entry to pick from (see the
// `teams.length > 1` checks in TeamChatView.tsx), so this renders as a
// plain single chat screen with no picker, same shape as
// DirectMessagesView but simpler (one fixed channel, no contact list).
// No hr_teams row backs this — it's a synthetic team object that exists
// purely to satisfy TeamChatView's props. The id MUST be
// HR_ADMIN_LINE_TEAM_ID (see hrData.ts) since every forward/notification
// into this channel is keyed on that exact constant.
const HR_ADMIN_TEAMS = [{ id: HR_ADMIN_LINE_TEAM_ID, name: 'HR & Admin', members: [] as string[] }];

// Deliberately does NOT call useAllMessages() here (unlike
// direct-messages/page.tsx) — that hook polls every hr_messages row every
// 20s just to compute a sidebar unread dot, which is exactly the
// always-on background cost this feature was explicitly asked not to add
// before someone actually opens this page. The sidebar's dot for this nav
// item is instead driven off hr_notifications (see
// hasUnseenHrAdminLineActivity in hrData.ts / Sidebar.tsx), which is
// already polled app-wide for TopNav's bell regardless of which page is
// open. TeamChatView itself only starts polling THIS channel's actual
// messages (useMessages(HR_ADMIN_LINE_TEAM_ID), already lazy/enabled-gated
// by teamId) once it mounts below.
export default function HrHrAdminPage() {
  const { data: allProfiles = [] } = useProfiles();
  const { data: allNotifications = [] } = useNotifications();
  const [hrEmail, setHrEmail] = useState('');

  useEffect(() => {
    setHrEmail(getSessionEmail() || '');
  }, []);

  // Clears the sidebar's unread dot for this channel by marking every
  // 'hr_admin_line' notification addressed to hr as read, the same
  // markNotificationsAsRead the bell dropdown uses — piggybacking on the
  // already-loaded useNotifications() feed rather than a dedicated fetch.
  useEffect(() => {
    if (!hrEmail) return;
    const relevant = allNotifications.filter(n => n.category === 'hr_admin_line' && n.recipientRole === 'hr');
    if (relevant.length > 0) hrActions.markNotificationsAsRead(relevant, hrEmail, 'hr').catch(() => {});
  }, [allNotifications, hrEmail]);

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
        currentUserEmail={hrEmail}
        currentUserRole="hr"
        allProfiles={allProfiles}
        oversight={false}
      />
    </div>
  );
}
