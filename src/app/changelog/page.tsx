'use client';

import React, { useState } from 'react';
import { PublicPage } from '@/components/landing/PublicPage';
import { ArrowRightIcon as ArrowRight } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';
import { ChangelogCard } from '@/components/changelog/ChangelogCard';
import { CHANGELOG_UPDATES } from '@/lib/changelogEntries';
import type { ChangelogEntry } from '@/lib/core/changelog';

// One entry; Read More opens its full details under the summary, and the "What's new" badge goes once it has been opened.
function PageEntry({ entry }: { entry: ChangelogEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <ChangelogCard entry={entry} label="Changelog" badge={!open} action={<Button size="sm" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Show less' : <>Read More <ArrowRight className="ml-1 h-4 w-4" /></>}</Button>}>
      {open && <ul className="list-disc space-y-1 pl-5 pt-1 text-sm text-slate-600">{entry.details.map(d => <li key={d}>{d}</li>)}</ul>}
    </ChangelogCard>
  );
}

// Every update to the app, newest first, grouped by update. Linked from Profile -> What's New.
export default function ChangelogPage() {
  return (
    <PublicPage badge="What's New" signIn={false}>
      <div className="mx-auto w-full max-w-2xl space-y-12 px-5 pb-16 pt-14 sm:px-8 sm:pt-24">
        <header className="space-y-2">
          <h1 className="font-display text-4xl font-black leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl">What&apos;s new</h1>
          <p className="text-sm font-semibold text-ink/60">Every improvement to the DelCargo HR app, newest first.</p>
        </header>
        {CHANGELOG_UPDATES.map(update => (
          <section key={update.id} className="space-y-4">
            <div>
              <h2 className="font-display text-2xl font-black text-ink">{update.name} · {update.tagline}</h2>
              <p className="text-xs font-semibold text-ink/60">{update.when}</p>
            </div>
            {update.entries.map(entry => <PageEntry key={entry.id} entry={entry} />)}
          </section>
        ))}
      </div>
    </PublicPage>
  );
}
