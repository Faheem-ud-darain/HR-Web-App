'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightIcon as ArrowRight } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';
import { PopupCard } from '@/components/ui/PopupCard';
import { ChangelogCard } from '@/components/changelog/ChangelogCard';
import { CHANGELOG, LATEST_CHANGELOG_ID } from '@/lib/changelogEntries';
import { unseenEntries, type ChangelogEntry } from '@/lib/core/changelog';
import { useAnyModalOpen } from '@/lib/modalStack';

const seenKey = (email: string) => `whatsnew_seen:${email.toLowerCase()}`;
const readSeen = (email: string): string | null => { try { return localStorage.getItem(seenKey(email)); } catch { return null; } };
const writeSeen = (email: string) => { try { localStorage.setItem(seenKey(email), LATEST_CHANGELOG_ID); } catch { /* nothing to remember it in: it shows again next time */ } };

// For every role, after an update, once per person: the new entries one at a time on a small floating card (1/3, Next), each
// with a Read More to the whole changelog. It waits for any blocking popup (a forced password change, an important announcement)
// to be dealt with first, and closing it, however, marks everything as seen.
export function WhatsNewPopup({ email }: { email: string | null }) {
  const router = useRouter();
  const anyModalOpen = useAnyModalOpen();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!email || open || anyModalOpen) return;
    const unseen = unseenEntries(CHANGELOG, readSeen(email));
    if (unseen.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the saved "seen" marker, which only the browser has
    setEntries(unseen); setIndex(0); setOpen(true);
  }, [email, open, anyModalOpen]);

  if (!email || entries.length === 0) return null;
  const entry = entries[index];
  const last = index === entries.length - 1;
  const close = () => { writeSeen(email); setOpen(false); setEntries([]); };

  return (
    <PopupCard isOpen={open} onClose={close} label="What's new">
      <ChangelogCard
        entry={entry}
        label="Changelog"
        action={<Button size="sm" onClick={() => { close(); router.push('/changelog'); }}>Read More <ArrowRight className="ml-1 h-4 w-4" /></Button>}
      >
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm font-bold text-slate-400">{index + 1}/{entries.length}</span>
          <Button variant="ghost" size="sm" onClick={last ? close : () => setIndex(index + 1)}>{last ? 'Done' : <>Next <ArrowRight className="ml-1 h-4 w-4" /></>}</Button>
        </div>
      </ChangelogCard>
    </PopupCard>
  );
}
