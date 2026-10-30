'use client';

import React, { useEffect, useState } from 'react';
import { WarningIcon as AlertTriangle } from '@/components/ui/icons';
import { AcknowledgeModal } from '@/components/ui/AcknowledgeModal';
import { hrActions, useAnnouncements, isAnnouncementForProfile, Profile } from '@/lib/hrData';

interface AnnouncementPopupProps {
  email: string | null;
  profile: Profile | null;
}

// Blocking popup for `important` announcements (see the Announcement.
// important comment in hrData.ts). Built on AcknowledgeModal, which cannot be
// dismissed by backdrop, Escape or X: the only way out is the explicit
// button, which calls hrActions.markAnnouncementRead (a real server write,
// not the passive "seen because it was rendered" tracking the Announcements
// feed widget on the dashboard Overview page uses).
//
// Mounted once in (dashboard)/layout.tsx, so it's present on every
// dashboard route for employee/team_lead — meaning it re-checks the read
// state (via useAnnouncements' own 30s poll, plus fresh on every mount) on
// every login and every full page refresh. Nothing here persists
// client-side (no localStorage/sessionStorage flag) — the read-state lives
// entirely in hr_announcement_reads_v1 on the server, which is what makes
// "reappears on every login/refresh until marked read" true by construction
// rather than something this component has to remember to do.
export function AnnouncementPopup({ email, profile }: AnnouncementPopupProps) {
  const { data: announcements } = useAnnouncements();
  const [readMap, setReadMap] = useState<Record<string, string[]>>({});
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!email) return;
    hrActions.getAnnouncementReadMap().then(setReadMap);
  }, [email, announcements?.length]);

  if (!email || !profile || !announcements) return null;

  // announcements already arrives sorted newest-first (useAnnouncements'
  // own `sort: '-created'` query) — filtering preserves that order, so
  // pending[0] is already "the most recent important thing this person
  // hasn't acknowledged yet", not an arbitrary one. Shown one at a time
  // (not a list) so each genuinely gets its own explicit acknowledgment;
  // marking one read re-renders this component and the next one (if any)
  // takes its place automatically.
  const pending = announcements.filter(ann =>
    ann.important &&
    isAnnouncementForProfile(ann, profile) &&
    !hrActions.isAnnouncementRead(ann, email, readMap)
  );

  if (pending.length === 0) return null;
  const current = pending[0];

  const handleMarkRead = async () => {
    if (marking) return;
    setMarking(true);
    try {
      await hrActions.markAnnouncementRead(current.id, email);
      // Optimistically fold this id into the local read map so the popup
      // for the *next* pending announcement (if any) appears immediately
      // instead of waiting on useAnnouncements' 30s poll or a manual
      // refetch — getAnnouncementReadMap() above already re-fetches
      // properly on the next mount/poll cycle regardless.
      setReadMap(prev => ({ ...prev, [current.id]: [...(prev[current.id] || []), email] }));
    } finally {
      setMarking(false);
    }
  };

  return (
    <AcknowledgeModal
      tone="amber" icon={AlertTriangle} eyebrow="Important Announcement" title={current.title}
      note={pending.length > 1 ? `${pending.length} important announcements need your attention` : 'This will keep appearing until you acknowledge it'}
      actionLabel="Mark as Read" busyLabel="Marking…" busy={marking} onAction={handleMarkRead}
    >
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words">{current.content}</p>
      <p className="text-caption text-slate-400 font-semibold mt-3">Posted by {current.createdBy} · {current.timestamp}</p>
    </AcknowledgeModal>
  );
}
