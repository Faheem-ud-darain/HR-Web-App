'use client';

import { useEffect, useState } from 'react';
import { hrActions, type Message, type Profile } from '@/lib/hrData';
import type { ReadScope } from '@/lib/hr/shared';
import { normEmail } from './chatHelpers';

interface ReceiptArgs {
  activeTeamId: string | null;
  // Name of the open channel, used to work out who can see it.
  teamName?: string;
  messages: Message[];
  currentUserEmail: string;
  allProfiles: Profile[];
}

// Tiny "seen by" receipts under messages (see hrActions.getMessageReadMap / markMessagesSeen). The messages on
// screen are marked as seen by the viewer on arrival, the same pattern as Announcements but scoped to one channel.
export function useChatReceipts({ activeTeamId, teamName, messages, currentUserEmail, allProfiles }: ReceiptArgs) {
  const [messageReadMap, setMessageReadMap] = useState<Record<string, string[]>>({});
  const [viewersMsgId, setViewersMsgId] = useState<string | null>(null);

  // Receipts only matter for people who can see this channel: its members plus HR/Admin (who oversee every
  // channel). Ask for just their read rows instead of every employee's.
  const receiptScope: ReadScope = {
    emails: [currentUserEmail, ...allProfiles
      .filter(p => p.role === 'hr' || p.role === 'admin' || (!!teamName && ((p.teams || []).includes(teamName) || (p.leadTeams || []).includes(teamName))))
      .map(p => p.email)],
  };

  useEffect(() => {
    if (!activeTeamId || messages.length === 0 || !currentUserEmail) return;
    hrActions.getMessageReadMap(receiptScope).then(setMessageReadMap);
    hrActions.markMessagesSeen(messages, currentUserEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeamId, messages.length, currentUserEmail]);

  const viewersForMessage = (msgId: string): Profile[] => {
    const emails = (messageReadMap[msgId] || []).map(e => e.toLowerCase()).filter(e => e !== currentUserEmail.toLowerCase());
    return allProfiles.filter(p => emails.includes(normEmail(p.email)));
  };

  const openMessageViewers = (msgId: string) => {
    setViewersMsgId(msgId);
    hrActions.getMessageReadMap(receiptScope).then(setMessageReadMap);
  };

  return { viewersMsgId, setViewersMsgId, viewersForMessage, openMessageViewers };
}
