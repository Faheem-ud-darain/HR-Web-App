'use client';

import { useEffect, useState } from 'react';
import { WrenchIcon as Wrench } from '@/components/ui/icons';
import { AcknowledgeModal } from '@/components/ui/AcknowledgeModal';
import { hrActions, useMaintenanceNotices } from '@/lib/hrData';
import { formatInViewerLocalTime } from '@/lib/timezone';
import { useNow } from '@/lib/useNow';

interface MaintenanceNoticePopupProps {
  email: string | null;
}

// Blocking popup for System Maintenance Notices (see MaintenanceNotice in
// hrData.ts) — modeled closely on AnnouncementPopup.tsx (same "cannot be
// dismissed except via its own button" reasoning, same read-state-lives-
// server-side-not-in-localStorage design), with two real differences:
//
// 1. Shown to EVERY role (Employee/Team Lead/HR/Admin alike) — mounted
//    unconditionally in (dashboard)/layout.tsx, unlike AnnouncementPopup
//    which excludes HR/Admin (the ones posting announcements). A system
//    going down for maintenance affects HR/Admin's own access just as much
//    as anyone else's, so there's no "you posted this, you're exempt"
//    exception here even though HR/Admin can also create these notices.
// 2. The start/end window is shown in the VIEWER'S OWN local timezone
//    (formatInViewerLocalTime), not the NY-locked format everything else in
//    this app uses — see the big comment block in timezone.ts for why this
//    is a deliberate one-off exception rather than a bug.
export function MaintenanceNoticePopup({ email }: MaintenanceNoticePopupProps) {
  const now = useNow(); // to ignore maintenance windows that already finished (see lib/useNow.ts)
  const { data: notices } = useMaintenanceNotices();
  const [readMap, setReadMap] = useState<Record<string, string[]>>({});
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!email) return;
    hrActions.getMaintenanceNoticeReadMap().then(setReadMap);
  }, [email, notices?.length]);

  if (!email || !notices || now === 0) return null;

  // Only bother blocking on a notice whose maintenance window hasn't
  // finished yet — no point interrupting someone's login to tell them
  // about maintenance that already happened. Newest-start-first so if
  // somehow more than one is still pending, the most relevant one leads.
  const pending = notices
    .filter(n => new Date(n.endAt).getTime() > now && !hrActions.isMaintenanceNoticeRead(n, email, readMap))
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());

  if (pending.length === 0) return null;
  const current = pending[0];
  const alreadyStarted = new Date(current.startAt).getTime() <= now;

  const handleMarkRead = async () => {
    if (marking) return;
    setMarking(true);
    try {
      await hrActions.markMaintenanceNoticeRead(current.id, email);
      setReadMap(prev => ({ ...prev, [current.id]: [...(prev[current.id] || []), email] }));
    } finally {
      setMarking(false);
    }
  };

  return (
    <AcknowledgeModal
      tone="sky" icon={Wrench} eyebrow={alreadyStarted ? 'Maintenance In Progress' : 'Scheduled System Maintenance'} title={current.title}
      note="This will keep appearing until you acknowledge it"
      actionLabel="Got It" busyLabel="Marking…" busy={marking} onAction={handleMarkRead}
    >
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words">{current.message}</p>
      <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
        <p className="text-caption font-bold text-slate-400 uppercase tracking-wider mb-1">Maintenance Window (your local time)</p>
        <p className="text-xs font-bold text-slate-800">
          {formatInViewerLocalTime(current.startAt)} — {formatInViewerLocalTime(current.endAt)}
        </p>
      </div>
    </AcknowledgeModal>
  );
}
