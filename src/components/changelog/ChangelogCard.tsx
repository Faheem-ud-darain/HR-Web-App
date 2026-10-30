import React from 'react';
import { ChangelogPreview } from '@/components/changelog/ChangelogPreview';
import type { ChangelogEntry } from '@/lib/core/changelog';

// One What's New entry: the animation on top, then the label, title and summary. `children` is what sits beneath (a "Read more"
// button in the popup, the full details on the changelog page). The popup and the page both use it.
export function ChangelogCard({ entry, children }: { entry: ChangelogEntry; children?: React.ReactNode }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-card">
      <ChangelogPreview kind={entry.preview} />
      <div className="space-y-1 p-4">
        <p className="text-caption font-bold uppercase tracking-wider text-orange-600">Changelog · {entry.when}</p>
        <h3 className="text-base font-bold text-slate-900">{entry.title}</h3>
        <p className="text-sm leading-relaxed text-slate-600">{entry.summary}</p>
        {children}
      </div>
    </article>
  );
}
