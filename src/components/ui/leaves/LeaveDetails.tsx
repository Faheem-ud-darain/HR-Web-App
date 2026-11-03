'use client';

import React, { useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { LeaveStatusBadge, LeaveTypeBadge } from '@/components/ui/StatusBadges';
import { CheckIcon } from '@/components/ui/icons';
import { eachLeaveDay, getLeaveRange, isWeekday, LEAVE_STATUS_MEANING, leaveDayCount, leaveProgress, type LeaveStep } from '@/lib/core/leaves';
import { dayLabel } from '@/lib/core/payrollView';
import { useLeaveDateChanges } from '@/lib/hr/leaveDateChange';
import type { LeaveApplication } from '@/lib/hrData';

// The full record of one leave request, for HR and Admin, whatever its status: who, which days, the whole reason, where it is in
// the approval, and anything still waiting on it. Every leave list shows a short row or card; this is what opens from it.

const STEP_STYLE: Record<LeaveStep['state'], string> = {
  done: 'bg-emerald-600 text-white',
  current: 'bg-amber-500 text-white',
  todo: 'bg-slate-200 text-slate-500',
  stopped: 'bg-rose-600 text-white',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-caption font-semibold uppercase text-slate-500">{label}</p>
      <div className="mt-0.5 text-sm font-semibold text-slate-900">{children}</div>
    </div>
  );
}

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');

function LeaveDetailsBody({ leave, name, picture }: { leave: LeaveApplication; name: string; picture?: string }) {
  const changes = useLeaveDateChanges();
  const pendingChange = (changes.data?.requests || []).find(r => r.leaveId === leave.id && r.status === 'pending');
  const range = getLeaveRange(leave);
  const days = range ? eachLeaveDay(range) : [];
  const working = days.filter(isWeekday).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar src={picture} name={name} size={40} className="shrink-0" />
          <p className="min-w-0 break-words text-base font-bold text-slate-900">{name}</p>
        </div>
        <LeaveStatusBadge status={leave.status} className="shrink-0" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Type"><LeaveTypeBadge type={leave.type} className="inline-block" /></Field>
        <Field label="Length">{range ? `${leaveDayCount(range)} calendar ${leaveDayCount(range) === 1 ? 'day' : 'days'} (${working} working)` : leave.duration}</Field>
        <div className="col-span-2">
          <Field label="Dates">{range ? (range.start === range.end ? dayLabel(range.start) : `${dayLabel(range.start)} to ${dayLabel(range.end)}`) : leave.duration}</Field>
        </div>
      </div>

      <Field label="Reason"><p className="whitespace-pre-wrap break-words font-medium text-slate-700">{leave.reason || 'No reason was given.'}</p></Field>

      <div>
        <p className="text-caption font-semibold uppercase text-slate-500">Progress</p>
        <ol className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          {leaveProgress(leave.status).map((step, i) => (
            <li key={step.label} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-caption ${STEP_STYLE[step.state]}`}>{step.state === 'done' ? <CheckIcon className="h-3 w-3" aria-hidden="true" /> : i + 1}</span>
              {step.label}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-slate-600">{LEAVE_STATUS_MEANING[leave.status]}</p>
      </div>

      {pendingChange && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-bold">A date change is waiting for an answer</p>
          <p className="mt-1">Asked to move {dayLabel(pendingChange.oldStart)} to {dayLabel(pendingChange.oldEnd)} onto {dayLabel(pendingChange.newStart)} to {dayLabel(pendingChange.newEnd)}.</p>
          {pendingChange.reason && <p className="mt-1">Reason: {pendingChange.reason}</p>}
        </div>
      )}

      {(leave.submittedAt || leave.updatedAt) && (
        <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
          {leave.submittedAt && <Field label="Requested"><span className="font-medium text-slate-700">{when(leave.submittedAt)}</span></Field>}
          {leave.updatedAt && <Field label="Last changed"><span className="font-medium text-slate-700">{when(leave.updatedAt)}</span></Field>}
        </div>
      )}
    </div>
  );
}

/** A "Details" button that opens the leave's full record. It owns its own open state, so any list can drop it in. */
export function LeaveDetails({ leave, name, picture, className = '' }: { leave: LeaveApplication; name: string; picture?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="xs" className={className} onClick={() => setOpen(true)} aria-label={`Leave details for ${name}`}>Details</Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Leave details">
        <LeaveDetailsBody leave={leave} name={name} picture={picture} />
      </Modal>
    </>
  );
}
