'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { hrActions, useAnnouncements, isAnnouncementForProfile, Profile } from '@/lib/hrData';

interface AnnouncementPopupProps {
  email: string | null;
  profile: Profile | null;
}

// Blocking popup for `important` announcements (see the Announcement.
// important comment in hrData.ts). Deliberately NOT built on top of the
// shared <Modal> component — that one closes on backdrop click, Escape,
// and an X button, all three of which would let someone dismiss this
// without ever pressing "Mark as Read". The whole point here is that it
// *cannot* be swept away by accident: the only way out is the explicit
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
    <div
      className="fixed inset-0 z-[var(--z-toast)] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm fade-enter"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="announcement-popup-title"
    >
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden dialog-enter">
        <div className="px-5 pt-5 pb-4 bg-amber-50 border-b border-amber-200 flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Important Announcement</p>
            <h2 id="announcement-popup-title" className="font-bold text-slate-900 text-base leading-tight mt-0.5">
              {current.title}
            </h2>
          </div>
        </div>

        <div className="px-5 py-4 max-h-[45vh] overflow-y-auto">
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words">{current.content}</p>
          <p className="text-[10px] text-slate-400 font-semibold mt-3">Posted by {current.createdBy} · {current.timestamp}</p>
        </div>

        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <p className="text-[10px] text-slate-400 font-semibold">
            {pending.length > 1 ? `${pending.length} important announcements need your attention` : 'This will keep appearing until you acknowledge it'}
          </p>
          <button
            onClick={handleMarkRead}
            disabled={marking}
            className="shrink-0 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-bold px-4 py-2 rounded-lg text-xs active:scale-97 transition-colors transition-transform shadow-sm flex items-center gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" /> {marking ? 'Marking…' : 'Mark as Read'}
          </button>
        </div>
      </div>
    </div>
  );
}
