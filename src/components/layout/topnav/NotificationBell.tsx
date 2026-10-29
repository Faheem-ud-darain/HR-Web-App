'use client';

import React from 'react';
import { BellIcon as Bell, TrashIcon as Trash2 } from '@/components/ui/icons';
import { useRouter } from 'next/navigation';
import type { Notification } from '@/lib/hrData';
import { formatRelativeDateNY } from '@/lib/timezone';
import { DismissibleArea } from '@/components/ui/DismissibleArea';
import { IconButton } from '@/components/ui/IconButton';
import { useBellNotifications } from './useBellNotifications';

// "Today" / "Yesterday" / a short date for the bell. `notification.timestamp` is only a time of day ("3:02 AM"),
// so the date comes from PocketBase's own `created` field, judged in America/New_York (see src/lib/timezone.ts).
function whenCreated(created?: string): string {
  const date = created ? new Date(created) : null;
  return date && !isNaN(date.getTime()) ? formatRelativeDateNY(date) : '';
}

// The notification bell and its list. Opening it marks everything shown as read.
export function NotificationBell({ role, email, open, onOpenChange }: { role: string | null; email: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const bell = useBellNotifications({ role, email });

  const toggle = () => {
    onOpenChange(!open);
    if (!open) void bell.markAllRead();
  };

  const row = (n: Notification) => {
    const when = whenCreated(n.created);
    const content = (
      <>
        <div className="text-slate-700 leading-relaxed font-medium whitespace-pre-wrap break-words">{n.message}</div>
        <div className="text-caption text-slate-500 font-medium text-right">{when}{when && n.timestamp ? ' • ' : ''}{n.timestamp}</div>
      </>
    );
    // Only notifications with a `link` (ticket / leave / chat mention: see buildNotificationLink) are clickable;
    // older and generic ones are a plain row. Each row has its own delete button (a button cannot sit inside the
    // clickable row's own <button>, hence the wrapper).
    return (
      <div key={n.id} className={`flex items-start transition-colors ${bell.isUnread(n) ? 'bg-orange-50/40' : ''} ${n.link ? 'hover:bg-slate-50' : ''}`}>
        {n.link ? (
          <button onClick={() => { onOpenChange(false); router.push(n.link!); }} className="flex-1 min-w-0 text-left p-3.5 text-xs flex flex-col gap-1">{content}</button>
        ) : (
          <div className="flex-1 min-w-0 p-3.5 text-xs flex flex-col gap-1">{content}</div>
        )}
        <button
          onClick={() => bell.deleteOne(n)}
          disabled={bell.deletingId === n.id}
          aria-label="Delete notification"
          title="Delete notification"
          className="shrink-0 mt-2.5 mr-2 p-1.5 rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };

  return (
    <DismissibleArea open={open} onClose={() => onOpenChange(false)} className="relative">
      <IconButton label="Notifications" badge={bell.unreadCount} onClick={toggle} aria-haspopup="true" aria-expanded={open}>
        <Bell className="h-5 w-5" />
      </IconButton>

      {open && (
        <div className="fixed top-16 left-4 right-4 sm:absolute sm:top-12 sm:right-0 sm:left-auto sm:w-[320px] bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden popover-enter">
          <div className="p-3.5 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center gap-2">
            <span className="font-bold text-xs text-slate-800">Notifications</span>
            <div className="flex items-center gap-2">
              {bell.notifications.length > 0 && (
                <button onClick={bell.clearAll} disabled={bell.clearing} className="text-caption font-bold text-slate-500 hover:text-rose-600 disabled:opacity-50 flex items-center gap-1 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" /> {bell.clearing ? 'Clearing…' : 'Clear All'}
                </button>
              )}
              <span className="text-caption text-slate-500 font-semibold capitalize">Scope: {role}</span>
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100">
            {bell.notifications.map(row)}
            {bell.notifications.length === 0 && <div className="p-8 text-center text-slate-500 font-medium text-xs">No alerts active</div>}
            {bell.canLoadMore && (
              <button onClick={bell.loadMore} disabled={bell.loadingMore} className="w-full p-3 text-caption font-bold text-orange-600 hover:bg-orange-50 transition-colors disabled:opacity-60">
                {bell.loadingMore ? 'Loading…' : 'Load older alerts'}
              </button>
            )}
          </div>
        </div>
      )}
    </DismissibleArea>
  );
}
