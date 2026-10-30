'use client';

import { useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormError } from '@/components/ui/FormError';
import { SectionCard } from '@/components/ui/SectionCard';
import { useLeaveNames } from '@/hooks/useLeaveNames';
import { CardStack } from '@/components/ui/CardStack';
import { formatLeaveDuration, type LeaveDateChange } from '@/lib/core/leaveDateChange';
import { leaveDateChangeAction, useLeaveDateChanges } from '@/lib/hr/leaveDateChange';

// For HR and Admin: the requests to move a leave to other days that are waiting for an answer. Approving moves the leave on its
// own (it used to be a manual database edit); the server checks the rules again and says why when it cannot.
export function LeaveDateChangeRequests({ onAnswered }: { onAnswered?: () => void }) {
  const { data, refetch } = useLeaveDateChanges();
  const { pictureFor } = useLeaveNames('admin');
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

  const card = (r: LeaveDateChange) => (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-card p-4">
      <div>
        <div className="flex items-center gap-2">
          <Avatar src={pictureFor(r.employeeName)} name={r.employeeName} size={28} className="shrink-0" />
          <p className="min-w-0 text-sm font-bold text-slate-900">{r.employeeName} <span className="font-semibold text-slate-500">· {r.leaveType} leave</span></p>
        </div>
        <p className="mt-1 text-xs font-semibold text-slate-600">From {formatLeaveDuration(r.oldStart, r.oldEnd)}</p>
        <p className="text-xs font-bold text-orange-600">To {formatLeaveDuration(r.newStart, r.newEnd)}</p>
        {r.reason && <p className="mt-1.5 text-xs text-slate-500">{r.reason}</p>}
      </div>
      <div className="flex gap-2">
        <Button variant="success" size="sm" className="flex-1" loading={busyId === r.id} disabled={busyId !== null} onClick={() => answer(r.id, 'approve')}>Approve</Button>
        <Button variant="danger" size="sm" className="flex-1" disabled={busyId !== null} onClick={() => answer(r.id, 'reject')}>Reject</Button>
      </div>
    </div>
  );

  return (
    <SectionCard title="Date change requests" subtitle="Employees asking to move a leave to other days." count={requests.length}>
      <div className="space-y-3 p-4 md:p-6">
        <FormError>{error}</FormError>
        {requests.length === 0 ? <EmptyState py={6} size="xs">No date change requests waiting.</EmptyState> : (
          <>
            {/* A phone gets a stack to swipe through; a bigger screen gets the plain list. */}
            <div className="md:hidden">
              <CardStack items={requests} keyOf={r => r.id} label="Date change requests" render={card} peek={r => `${r.employeeName} · ${r.leaveType} leave · to ${formatLeaveDuration(r.newStart, r.newEnd)}`} />
            </div>
            <ul className="hidden space-y-3 md:block">{requests.map(r => <li key={r.id}>{card(r)}</li>)}</ul>
          </>
        )}
      </div>
    </SectionCard>
  );
}
