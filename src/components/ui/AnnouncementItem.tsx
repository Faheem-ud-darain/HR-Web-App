import React from 'react';
import { WarningIcon as AlertTriangle } from '@/components/ui/icons';
import { Badge } from '@/components/ui/Badge';
import { ExpandableText } from '@/components/ui/ExpandableText';

interface AnnouncementItemProps {
  title: string;
  content: string;
  important?: boolean;
  /** Not yet read by the person looking: a dot and a "New" badge. */
  unread?: boolean;
  /** "By HR Manager · Sep 13, 3:01 PM" */
  meta: React.ReactNode;
  /** Who it went to, for people who posted it: "Everyone", "USA", warehouse names. */
  audience?: string;
  /** Buttons on the right of the title (forward, delete). */
  actions?: React.ReactNode;
  /** Anything under the meta line, e.g. who has viewed it. */
  children?: React.ReactNode;
}

// One announcement, the same everywhere: the posters' list on the HR and Admin dashboards and the employees' feed.
export function AnnouncementItem({ title, content, important, unread, meta, audience, actions, children }: AnnouncementItemProps) {
  return (
    <article className={`px-4 md:px-6 py-4 ${unread ? 'bg-orange-50/60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-slate-900">
            {unread && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500 presence-dot" />}
            <span className="min-w-0 break-words">{title}</span>
            {unread && <Badge variant="warning" size="sm">New</Badge>}
            {important && <Badge variant="danger" size="sm"><AlertTriangle className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Important</Badge>}
          </h4>
        </div>
        {actions && <div className="-my-1 -mr-1.5 flex shrink-0 items-center">{actions}</div>}
      </div>
      <ExpandableText text={content} className="mt-1.5 text-sm leading-relaxed text-slate-600" />
      <p className="mt-2 text-caption font-semibold text-slate-500">
        {meta}
        {audience && <> · <span>To {audience}</span></>}
      </p>
      {children}
    </article>
  );
}
