'use client';

import { Button } from '@/components/ui/Button';
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
      <p className="text-caption text-amber-600 font-bold">+{formatMoney(pending, profile.region)} pending ({years} yr{years > 1 ? 's' : ''})</p>
      <Button type="button" variant="softEmerald" size="xs" className="mt-1" onClick={() => setConfirming(true)} loading={applying}>{applying ? 'Applying…' : 'Apply Increment Now'}</Button>
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
