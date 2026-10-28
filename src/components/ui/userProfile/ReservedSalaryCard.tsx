'use client';

import React, { useState } from 'react';
import { CurrencyDollarIcon as DollarSign } from '@phosphor-icons/react/dist/ssr';
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

  const small = 'text-[10px] font-bold px-2.5 py-1.5 rounded-md active:scale-97 transition-colors transition-transform';
  return (
    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2 text-xs">
      <p className="font-bold text-indigo-900 flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Reserved Salary</p>
      <div className="grid grid-cols-2 gap-2 text-[11px] font-medium text-indigo-800">
        <div><span className="block text-[9px] text-indigo-400 font-bold uppercase">Auto-Reserved (system)</span>{formatMoney(profile.reservedSalaryBalance || 0, profile.region)}</div>
        <div><span className="block text-[9px] text-indigo-400 font-bold uppercase">Manually Reserved</span>{formatMoney(profile.manualReservedAmount || 0, profile.region)}</div>
      </div>
      {profile.manualReservedNote && <p className="text-[10px] text-indigo-700 italic">Note: {profile.manualReservedNote}</p>}
      <p className="text-[9px] text-indigo-500 leading-relaxed">
        Both amounts are held and paid out only at resignation/termination — neither is deducted from this employee&apos;s current pay.
      </p>

      {!editing ? (
        <button type="button" onClick={open} className={`${small} text-indigo-700 bg-indigo-100 hover:bg-indigo-200`}>Edit Manually Reserved Amount</button>
      ) : (
        <div className="space-y-2 pt-1">
          <div><FieldLabel size="tiny">Amount</FieldLabel><Input type="text" value={amount} onChange={e => setAmount(e.target.value)} fieldSize="md" placeholder="0" /></div>
          <div><FieldLabel size="tiny">Note (optional)</FieldLabel><Input type="text" value={note} onChange={e => setNote(e.target.value)} fieldSize="md" placeholder="e.g. carried over from before this system" /></div>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={saving} className={`${small} text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50`}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => setEditing(false)} disabled={saving} className={`${small} text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50`}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
