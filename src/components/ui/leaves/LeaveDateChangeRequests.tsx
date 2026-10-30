'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormError } from '@/components/ui/FormError';
import { SectionCard } from '@/components/ui/SectionCard';
import { formatLeaveDuration } from '@/lib/core/leaveDateChange';
import { leaveDateChangeAction, useLeaveDateChanges } from '@/lib/hr/leaveDateChange';

// For HR and Admin: the requests to move a leave to other days that are waiting for an answer. Approving moves the leave on its
// own (it used to be a manual database edit); the server checks the rules again and says why when it cannot.
export function LeaveDateChangeRequests({ onAnswered }: { onAnswered?: () => void }) {
  const { data, refetch } = useLeaveDateChanges();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (!data?.configured) return null;
  const requests = data.requests;

  const answer = async (changeId: string, action: 'approve' | 'reject') => {
    setBusyId(changeId);
    setError('');
    try {
      await leaveDateChangeAction({ action, changeId });
      await refetch();
      onAnswered?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the answer.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SectionCard title="Date change requests" subtitle="Employees asking to move a leave to other days." count={requests.length}>
      <div className="space-y-3 p-4 md:p-6">
        <FormError>{error}</FormError>
        {requests.length === 0 ? <EmptyState py={6} size="xs">No date change requests waiting.</EmptyState> : (
          <ul className="space-y-3">
            {requests.map(r => (
              <li key={r.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">{r.employeeName} <span className="font-semibold text-slate-500">· {r.leaveType} leave</span></p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">From {formatLeaveDuration(r.oldStart, r.oldEnd)}</p>
                  <p className="text-xs font-bold text-orange-600">To {formatLeaveDuration(r.newStart, r.newEnd)}</p>
                  {r.reason && <p className="mt-1.5 text-xs text-slate-500">{r.reason}</p>}
                </div>
                <div className="flex gap-2">
                  <Button variant="success" size="sm" className="flex-1" loading={busyId === r.id} disabled={busyId !== null} onClick={() => answer(r.id, 'approve')}>Approve</Button>
                  <Button variant="danger" size="sm" className="flex-1" disabled={busyId !== null} onClick={() => answer(r.id, 'reject')}>Reject</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
