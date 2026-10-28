'use client';

import React, { useState } from 'react';
import { applyIncrementServer, formatMoney, getMissedIncrementEvents, getPendingIncrement, type Profile } from '@/lib/hrData';
import { ConfirmDialog } from '../ConfirmDialog';

// Under the base salary: the anniversary increment that has not been folded in yet, with a button (HR/Admin) to apply
// it now. That adds it straight to base_salary, outside the normal payroll flow: also the fix for records that were
// marked processed before payroll applied increments correctly and would otherwise show the old salary forever.
export function PendingIncrement({ profile, onChanged }: { profile: Profile; onChanged: () => void | Promise<unknown> }) {
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const pending = getPendingIncrement(profile);
  if (pending <= 0) return null;

  const apply = async () => {
    setConfirming(false);
    setApplying(true);
    try {
      await applyIncrementServer(profile, profile.baseSalary, pending);
      await onChanged();
    } finally {
      setApplying(false);
    }
  };

  const years = getMissedIncrementEvents(profile);
  return (
    <div className="mt-1.5">
      <p className="text-[10px] text-amber-600 font-bold">+{formatMoney(pending, profile.region)} pending ({years} yr{years > 1 ? 's' : ''})</p>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={applying}
        className="mt-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-50 px-2 py-1 rounded-md active:scale-97 transition-colors transition-transform"
      >
        {applying ? 'Applying…' : 'Apply Increment Now'}
      </button>
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={apply}
        title="Apply increment now?"
        message={`Apply +${formatMoney(pending, profile.region)} to ${profile.fullName}'s base salary now? This updates their real base salary immediately, outside the normal payroll cycle.`}
        confirmLabel={applying ? 'Applying…' : 'Apply Increment Now'}
        variant="warning"
        loading={applying}
      />
    </div>
  );
}
