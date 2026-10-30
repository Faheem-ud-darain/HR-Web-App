'use client';

import { AnnouncementItem } from '@/components/ui/AnnouncementItem';
import { AnnouncementFeed } from '@/components/ui/AnnouncementFeed';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionCard } from '@/components/ui/SectionCard';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { hrActions, type Announcement } from '@/lib/hrData';
import { announcementWhen } from '@/lib/core/announcements';

const SHOWN_AT_FIRST = 3;

// The company's announcements for this employee, newest first. Ones they have not read yet are highlighted (and counted
// in the header); a list with "Show all" on a desktop, a swipeable stack on a phone.
export function AnnouncementsCard({ announcements, email, readMap, loading }: { announcements: Announcement[]; email?: string; readMap: Record<string, string[]>; loading: boolean }) {
  const isUnread = (a: Announcement) => !!email && !hrActions.isAnnouncementRead(a, email, readMap);
  return (
    <SectionCard title="Company Announcements" count={loading ? undefined : announcements.filter(isUnread).length}>
      {loading ? <div className="p-4"><ListSkeleton rows={2} /></div> : announcements.length === 0 ? <EmptyState py={8} size="xs">No announcements for your region.</EmptyState> : (
        <AnnouncementFeed
          announcements={announcements}
          shownAtFirst={SHOWN_AT_FIRST}
          render={a => <AnnouncementItem title={a.title} content={a.content} important={a.important} unread={isUnread(a)} meta={`${a.createdBy} · ${announcementWhen(a.timestamp)}`} />}
        />
      )}
    </SectionCard>
  );
}
