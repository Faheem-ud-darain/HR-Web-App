'use client';

import { useState } from 'react';
import { AnnouncementItem } from '@/components/ui/AnnouncementItem';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionCard } from '@/components/ui/SectionCard';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { hrActions, type Announcement } from '@/lib/hrData';
import { announcementWhen } from '@/lib/core/announcements';

const SHOWN_AT_FIRST = 3;

// The company's announcements for this employee, newest first. Ones they have not read yet are highlighted (and counted
// in the header); the list opens with the latest few and "Show all" reveals the rest.
export function AnnouncementsCard({ announcements, email, readMap, loading }: { announcements: Announcement[]; email?: string; readMap: Record<string, string[]>; loading: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const isUnread = (a: Announcement) => !!email && !hrActions.isAnnouncementRead(a, email, readMap);
  const shown = showAll ? announcements : announcements.slice(0, SHOWN_AT_FIRST);
  return (
    <SectionCard title="Company Announcements" count={loading ? undefined : announcements.filter(isUnread).length}>
      {loading ? <div className="p-4"><ListSkeleton rows={2} /></div> : announcements.length === 0 ? <EmptyState py={8} size="xs">No announcements for your region.</EmptyState> : (
        <div className="divide-y divide-slate-100">
          {shown.map(a => (
            <AnnouncementItem key={a.id} title={a.title} content={a.content} important={a.important} unread={isUnread(a)} meta={`${a.createdBy} · ${announcementWhen(a.timestamp)}`} />
          ))}
        </div>
      )}
      {announcements.length > SHOWN_AT_FIRST && (
        <div className="border-t border-slate-100 px-4 py-2 md:px-6"><Button variant="ghost" size="sm" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer' : `Show all ${announcements.length}`}</Button></div>
      )}
    </SectionCard>
  );
}
