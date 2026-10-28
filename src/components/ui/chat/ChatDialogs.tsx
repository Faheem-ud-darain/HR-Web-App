'use client';

import React from 'react';
import { displayName, type Profile } from '@/lib/hrData';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { RoleBadge } from './chatHelpers';

type Viewer = 'admin' | 'hr' | 'employee' | 'team_lead';

function PersonRow({ person, viewerRole, isYou }: { person: Profile; viewerRole: Viewer; isYou?: boolean }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
      <Avatar src={person.profilePicture} name={displayName(person, viewerRole)} size={36} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
          {displayName(person, viewerRole)}
          {isYou && <span className="text-[11px] text-slate-500 font-semibold">(You)</span>}
        </p>
        <p className="text-xs text-slate-500 truncate">{person.email}</p>
      </div>
      {isYou !== undefined && <RoleBadge role={person.role} />}
    </div>
  );
}

// "Seen by": who has viewed one message (same pattern as Announcements, scoped to a single message).
export function MessageViewersModal({ viewers, viewerRole, onClose }: { viewers: Profile[]; viewerRole: Viewer; onClose: () => void }) {
  return (
    <Modal isOpen onClose={onClose} title={`Seen by (${viewers.length})`}>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {viewers.map(v => <PersonRow key={v.id} person={v} viewerRole={viewerRole} />)}
      </div>
    </Modal>
  );
}

// "Who's in this channel": team members plus every Admin (who can post in any channel), the same list @mention
// suggestions draw from. Role badges match the ones shown on messages.
export function ChannelMembersModal({ teamName, members, viewerRole, viewerEmail, onClose }: { teamName: string; members: Profile[]; viewerRole: Viewer; viewerEmail: string; onClose: () => void }) {
  return (
    <Modal isOpen onClose={onClose} title={`${teamName} — Members (${members.length})`}>
      <div className="space-y-1 max-h-96 overflow-y-auto">
        {members.map(p => <PersonRow key={p.id} person={p} viewerRole={viewerRole} isYou={p.email.toLowerCase() === viewerEmail.toLowerCase()} />)}
        {members.length === 0 && <EmptyState py={8} size="xs">No members in this channel yet.</EmptyState>}
      </div>
    </Modal>
  );
}
