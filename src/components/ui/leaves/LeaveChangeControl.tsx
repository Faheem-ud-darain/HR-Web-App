'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { canChangeDates, formatLeaveDuration, type LeaveDateChange } from '@/lib/core/leaveDateChange';
import { leaveDateChangeAction } from '@/lib/hr/leaveDateChange';
import type { LeaveApplication } from '@/lib/hrData';
import { getNYDateString } from '@/lib/timezone';
import { LeaveDateChangeModal } from './LeaveDateChangeModal';

// Next to an employee's leave request: "Change dates" while that is possible, or the change they already asked for, waiting for an
// answer, with a way to withdraw it. Used by the desktop table and the phone card alike. Shows nothing until Admin has run the set-up.
export function LeaveChangeControl({ leave, pending, configured, onChanged }: { leave: LeaveApplication; pending?: LeaveDateChange; configured: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!configured) return null;

  if (pending) {
    return (
      <div className="flex flex-col items-start gap-1.5 sm:items-center">
        <Badge variant="warning" size="sm">Change requested: {formatLeaveDuration(pending.newStart, pending.newEnd)}</Badge>
        <Button variant="ghost" size="sm" loading={busy} onClick={async () => { setBusy(true); try { await leaveDateChangeAction({ action: 'cancel', changeId: pending.id }); onChanged(); } finally { setBusy(false); } }}>Withdraw change</Button>
      </div>
    );
  }
  if (!canChangeDates(leave, getNYDateString(new Date()))) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Change dates</Button>
      {open && <LeaveDateChangeModal leave={leave} onClose={() => setOpen(false)} onSent={onChanged} />}
    </>
  );
}
