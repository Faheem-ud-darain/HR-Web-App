'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CardStack } from '@/components/ui/CardStack';

// How many announcements a phone's stack holds (the newest), and how many the list shows before "Show all".
const STACK_MAX = 8;

interface AnnouncementFeedProps<T extends { id: string; title: string }> {
  announcements: T[];
  /** One announcement, drawn the same in the list and in the stack. */
  render: (announcement: T) => React.ReactNode;
  shownAtFirst: number;
}

// The announcements as a list on a tablet or desktop, and as a swipeable stack (newest on top, going round) on a phone.
export function AnnouncementFeed<T extends { id: string; title: string }>({ announcements, render, shownAtFirst }: AnnouncementFeedProps<T>) {
  const [showAll, setShowAll] = useState(false);
  return (
    <>
      <div className="p-3 md:hidden">
        <CardStack items={announcements.slice(0, STACK_MAX)} keyOf={a => a.id} label="Announcements" peek={a => a.title} render={a => <div className="rounded-xl border border-slate-200 bg-card">{render(a)}</div>} />
      </div>
      <div className="hidden divide-y divide-slate-100 md:block">{(showAll ? announcements : announcements.slice(0, shownAtFirst)).map(a => <React.Fragment key={a.id}>{render(a)}</React.Fragment>)}</div>
      {announcements.length > shownAtFirst && (
        <div className="hidden border-t border-slate-100 px-4 py-2 md:block md:px-6">
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer' : `Show all ${announcements.length}`}</Button>
        </div>
      )}
    </>
  );
}
