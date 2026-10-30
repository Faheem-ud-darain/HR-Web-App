'use client';

import { Button } from '@/components/ui/Button';
import React, { useState } from 'react';
import { CurrencyDollarIcon as DollarSign } from '@/components/ui/icons';
import { formatMoney, updateProfileAdmin, type Profile } from '@/lib/hrData';
import { parseReserveAmount } from '@/lib/core/userProfile';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { Input } from '@/components/ui/Input';

// HR/Admin only. reservedSalaryBalance is system-managed (the automatic first-month withhold) and read-only here;
// manualReservedAmount is a tracking note HR/Admin can record for an existing employee. It never touches live payroll:
// both amounts are held and only paid out at resignation or termination.
export function ReservedSalaryCard({ profile, onChanged }: { profile: Profile; onChanged: () => void | Promise<unknown> }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const open = () => {
    setAmount(profile.manualReservedAmount ? String(profile.manualReservedAmount) : '');
    setNote(profile.manualReservedNote || '');
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateProfileAdmin(profile.id, { manualReservedAmount: parseReserveAmount(amount), manualReservedNote: note.trim() });
      await onChanged();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2 text-xs">
      <p className="font-bold text-indigo-900 flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Reserved Salary</p>
      <div className="grid grid-cols-2 gap-2 text-caption font-medium text-indigo-800">
        <div><span className="block text-caption text-indigo-400 font-bold uppercase">Auto-Reserved (system)</span>{formatMoney(profile.reservedSalaryBalance || 0, profile.region)}</div>
        <div><span className="block text-caption text-indigo-400 font-bold uppercase">Manually Reserved</span>{formatMoney(profile.manualReservedAmount || 0, profile.region)}</div>
      </div>
      {profile.manualReservedNote && <p className="text-caption text-indigo-700 italic">Note: {profile.manualReservedNote}</p>}
      <p className="text-caption text-indigo-500 leading-relaxed">
        Both amounts are held and paid out only at resignation/termination — neither is deducted from this employee&apos;s current pay.
      </p>

      {!editing ? (
        <Button type="button" variant="softIndigo" size="xs" onClick={open}>Edit Manually Reserved Amount</Button>
      ) : (
        <div className="space-y-2 pt-1">
          <div><FieldLabel size="tiny">Amount</FieldLabel><Input type="text" value={amount} onChange={e => setAmount(e.target.value)} fieldSize="md" placeholder="0" /></div>
          <div><FieldLabel size="tiny">Note (optional)</FieldLabel><Input type="text" value={note} onChange={e => setNote(e.target.value)} fieldSize="md" placeholder="e.g. carried over from before this system" /></div>
          <div className="flex gap-2">
            <Button type="button" variant="indigo" size="xs" onClick={save} loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            <Button type="button" variant="outline" size="xs" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
