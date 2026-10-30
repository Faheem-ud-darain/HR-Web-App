'use client';

import { useState } from 'react';
import { FormField } from '@/components/ui/FormField';
import { FormModal } from '@/components/ui/FormModal';
import { Input, Textarea } from '@/components/ui/Input';
import { InfoNote } from '@/components/ui/InfoNote';
import { getLeaveRange } from '@/lib/core/leaves';
import { leaveDateChangeAction } from '@/lib/hr/leaveDateChange';
import type { LeaveApplication } from '@/lib/hrData';

// "Change dates" on one of the employee's own leave requests: pick the new days and say why. The request goes to HR and Admin;
// the leave keeps its current days until one of them approves. The server checks every rule and its message is shown as is.
export function LeaveDateChangeModal({ leave, onClose, onSent }: { leave: LeaveApplication; onClose: () => void; onSent: () => void }) {
  const old = getLeaveRange(leave);
  const [start, setStart] = useState(old?.start ?? '');
  const [end, setEnd] = useState(old?.end ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await leaveDateChangeAction({ action: 'request', leaveId: leave.id, newStart: start, newEnd: end, reason });
      onSent();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal title="Change leave dates" onClose={onClose} onSubmit={submit} busy={busy} error={error} submitLabel="Send request" note="HR or Admin will answer. Your leave stays on its current days until they approve the change.">
      <InfoNote>{leave.type} leave now: {leave.duration}</InfoNote>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="New start date *" size="md"><Input type="date" value={start} onChange={e => setStart(e.target.value)} required /></FormField>
        <FormField label="New end date *" size="md"><Input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)} required /></FormField>
      </div>
      <FormField label="Why do the dates need to change? *" size="md"><Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. My exam was moved to the following week." required /></FormField>
    </FormModal>
  );
}
