import React from 'react';
import { ChangelogPreview } from '@/components/changelog/ChangelogPreview';
import type { ChangelogEntry } from '@/lib/core/changelog';

// One What's New entry: the animation with a "What's new" badge on top; below it the label, title and summary with the Read More
// button on the right (`action`), and whatever else belongs beneath (`children`: the full details, or the popup's Next row).
// `badge` is false once someone has opened the entry's details. The popup and the changelog page both use it.
export function ChangelogCard({ entry, label, action, badge = true, children }: { entry: ChangelogEntry; label: string; action?: React.ReactNode; badge?: boolean; children?: React.ReactNode }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-card">
      <ChangelogPreview kind={entry.preview} badge={badge} />
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption font-bold uppercase tracking-wider text-orange-600">{label}</p>
            <h3 className="text-base font-bold leading-snug text-slate-900">{entry.title}</h3>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        <p className="text-sm leading-relaxed text-slate-600">{entry.summary}</p>
        {children}
      </div>
    </article>
  );
}
