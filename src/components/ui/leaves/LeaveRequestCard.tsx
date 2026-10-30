import React from 'react';
import { Button } from '@/components/ui/Button';
import { LeaveTypeBadge } from '@/components/ui/StatusBadges';
import type { LeaveApplication } from '@/lib/hrData';

// One leave request as a card: who, the type, the dates and the reason, with whatever buttons or note belong to its state in
// `children`. The phone view of every leave screen (HR's board, the Admin dashboard, the CEO queue) uses it, usually inside a
// CardStack when there are several.
export function LeaveRequestCard({ leave, name, children }: { leave: LeaveApplication; name: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-bold leading-tight text-slate-900">{name}</p>
        <LeaveTypeBadge type={leave.type} className="shrink-0" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-caption font-semibold uppercase text-slate-500">Dates</p>
          <p className="text-xs font-bold text-slate-800">{leave.duration}</p>
        </div>
        <div>
          <p className="text-caption font-semibold uppercase text-slate-500">Reason</p>
          <p className="line-clamp-2 text-xs font-bold text-slate-800">{leave.reason || '—'}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

// The CEO's two answers for a leave that HR has sent on.
export function CeoDecisionButtons({ busy, disabled, onDecide }: { busy: boolean; disabled: boolean; onDecide: (action: 'approve' | 'reject') => void }) {
  return (
    <div className="flex gap-2">
      <Button variant="success" size="sm" className="flex-1" loading={busy} disabled={disabled} onClick={() => onDecide('approve')}>CEO Approve</Button>
      <Button variant="danger" size="sm" className="flex-1" disabled={disabled} onClick={() => onDecide('reject')}>Reject</Button>
    </div>
  );
}
