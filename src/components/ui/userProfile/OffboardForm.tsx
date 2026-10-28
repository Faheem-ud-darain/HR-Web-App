'use client';

import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { formatMoney, getFinalLeavePayout, getPTOAccrualDate, getRemainingPTO, type LeaveApplication, type Profile } from '@/lib/hrData';
import { companyNumberBlocksOffboard, offboardFormFrom, type OffboardForm as Values } from '@/lib/core/userProfile';
import { Button } from '../Button';
import { FormField } from '../FormField';
import { Textarea } from '../Input';

const CheckRow = ({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) => (
  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded border-slate-300 text-orange-600 focus:ring-orange-500" />
    {children}
  </label>
);

interface OffboardFormProps {
  profile: Profile;
  leaves: LeaveApplication[];
  onCancel: () => void;
  // Called with the checklist once it is complete; the card then asks for the final confirmation.
  onSubmit: (values: Values) => void;
}

// The offboarding checklist. Completing it deactivates the account: the final PTO/Sick payout is shown here and
// recorded on confirmation, and a company-allocated number on file must be confirmed returned first.
export function OffboardForm({ profile, leaves, onCancel, onSubmit }: OffboardFormProps) {
  const [values, setValues] = useState<Values>(() => offboardFormFrom(profile));
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues(v => ({ ...v, [key]: value }));
  const hasCompanyNumber = !!profile.companyPhone;
  const blocked = companyNumberBlocksOffboard(profile, values);

  return (
    <form onSubmit={e => { e.preventDefault(); if (!blocked) onSubmit(values); }} className="space-y-4">
      <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl space-y-1.5">
        <p className="font-bold text-rose-800 text-xs flex items-center gap-1.5"><ShieldAlert className="h-4 w-4" /> Account Offboarding Checklist</p>
        <p className="text-[11px] text-rose-700 font-semibold leading-relaxed">Completing this checklist deactivates this user&apos;s account and blocks all access to the workspace immediately.</p>
      </div>

      <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Final PTO/Sick Bank Payout</p>
          <p className="text-[9px] text-emerald-600 font-semibold mt-0.5">
            {getRemainingPTO(leaves, profile.fullName, getPTOAccrualDate(profile))} remaining days × daily rate (monthly salary ÷ 22)
          </p>
        </div>
        <p className="text-lg font-bold text-emerald-800">{formatMoney(getFinalLeavePayout(profile, leaves), profile.region)}</p>
      </div>

      <div className="space-y-2">
        <CheckRow checked={values.itClearance} onChange={c => set('itClearance', c)}>1. IT Hardware Clearance &amp; Assets Recovered</CheckRow>
        <CheckRow checked={values.financeClearance} onChange={c => set('financeClearance', c)}>2. Finance Account Settlement &amp; Pending dues paid</CheckRow>
        <CheckRow checked={values.hrClearance} onChange={c => set('hrClearance', c)}>3. HR Resignation clearance signed off</CheckRow>
        {hasCompanyNumber ? (
          <CheckRow checked={values.companyNumberReturned} onChange={c => set('companyNumberReturned', c)}>
            4. Company-Allocated Number ({profile.companyPhone}) Returned <span className="text-rose-600">*Required</span>
          </CheckRow>
        ) : (
          <p className="text-[10px] text-slate-400 italic pl-0.5">4. No company-allocated number on file — nothing to return.</p>
        )}
      </div>

      {blocked && (
        <p className="text-[10px] text-rose-600 font-semibold bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 leading-relaxed">
          This employee has a company-allocated number on file. Confirm it&apos;s been returned before offboarding can be completed.
        </p>
      )}

      <FormField label="Offboarding Notes / Reason">
        <Textarea rows={3} value={values.notes} onChange={e => set('notes', e.target.value)} placeholder="Reason for resignation or termination checklist notes..." fieldSize="sm" className="resize-none" />
      </FormField>

      <div className="flex gap-2 pt-3 border-t border-slate-100">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="danger" disabled={blocked} className="flex-1">Deactivate &amp; Offboard</Button>
      </div>
    </form>
  );
}
