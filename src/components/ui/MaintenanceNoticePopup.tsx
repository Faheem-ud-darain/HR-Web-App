'use client';

import { useEffect, useState } from 'react';
import { Wrench, CheckCircle2 } from 'lucide-react';
import { hrActions, useMaintenanceNotices } from '@/lib/hrData';
import { formatInViewerLocalTime } from '@/lib/timezone';

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
  const { data: notices } = useMaintenanceNotices();
  const [readMap, setReadMap] = useState<Record<string, string[]>>({});
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!email) return;
    hrActions.getMaintenanceNoticeReadMap().then(setReadMap);
  }, [email, notices?.length]);

  if (!email || !notices) return null;

  // Only bother blocking on a notice whose maintenance window hasn't
  // finished yet — no point interrupting someone's login to tell them
  // about maintenance that already happened. Newest-start-first so if
  // somehow more than one is still pending, the most relevant one leads.
  const now = Date.now();
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
    <div
      className="fixed inset-0 z-[var(--z-toast)] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm fade-enter"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="maintenance-popup-title"
    >
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden dialog-enter">
        <div className="px-5 pt-5 pb-4 bg-sky-50 border-b border-sky-200 flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-sky-100 border border-sky-200 flex items-center justify-center shrink-0">
            <Wrench className="h-5 w-5 text-sky-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-sky-700 uppercase tracking-wider">
              {alreadyStarted ? 'Maintenance In Progress' : 'Scheduled System Maintenance'}
            </p>
            <h2 id="maintenance-popup-title" className="font-bold text-slate-900 text-base leading-tight mt-0.5">
              {current.title}
            </h2>
          </div>
        </div>

        <div className="px-5 py-4 max-h-[45vh] overflow-y-auto">
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words">{current.message}</p>
          <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Maintenance Window (your local time)</p>
            <p className="text-xs font-bold text-slate-800">
              {formatInViewerLocalTime(current.startAt)} — {formatInViewerLocalTime(current.endAt)}
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <p className="text-[10px] text-slate-400 font-semibold">
            This will keep appearing until you acknowledge it
          </p>
          <button
            onClick={handleMarkRead}
            disabled={marking}
            className="shrink-0 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-bold px-4 py-2 rounded-lg text-xs active:scale-97 transition-colors transition-transform shadow-sm flex items-center gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" /> {marking ? 'Marking…' : 'Got It'}
          </button>
        </div>
      </div>
    </div>
  );
}
