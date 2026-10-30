'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ChangelogCard } from '@/components/changelog/ChangelogCard';
import { CHANGELOG, LATEST_CHANGELOG_ID } from '@/lib/changelogEntries';
import { unseenEntries, type ChangelogEntry } from '@/lib/core/changelog';
import { useAnyModalOpen } from '@/lib/modalStack';

const seenKey = (email: string) => `whatsnew_seen:${email.toLowerCase()}`;
const readSeen = (email: string): string | null => { try { return localStorage.getItem(seenKey(email)); } catch { return null; } };
const writeSeen = (email: string) => { try { localStorage.setItem(seenKey(email), LATEST_CHANGELOG_ID); } catch { /* nothing to remember it in: it shows again next time */ } };

// After an update, once per person: the new entries one at a time (1/3, Next), each with a link to the whole changelog. It waits for
// any blocking popup (a forced password change, an important announcement) to be dealt with first, and closing it, however, marks
// everything as seen.
export function WhatsNewPopup({ email }: { email: string | null }) {
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
    <Modal
      isOpen={open}
      onClose={close}
      title="What's new"
      eyebrow={`${index + 1}/${entries.length}`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={close}>{last ? 'Close' : 'Skip'}</Button>
          {!last && <Button size="sm" onClick={() => setIndex(index + 1)}>Next</Button>}
        </div>
      }
    >
      <ChangelogCard entry={entry}>
        <Link href="/changelog" onClick={close} className="inline-block pt-1 text-sm font-semibold text-orange-600 hover:text-orange-700">Read more →</Link>
      </ChangelogCard>
    </Modal>
  );
}
