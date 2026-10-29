'use client';

import React from 'react';
import { UserIcon as User } from '@/components/ui/icons';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import type { Profile } from '@/lib/hrData';
import { bankIdLabel } from '@/lib/core/onboarding';
import { StepActions, StepHeader } from './StepParts';

type Bank = { bankName: string; accountNumber: string; iban: string };

// Step 1: who you are (read-only, from the account HR made) and where salary is paid.
export function BankDetailsStep({ profile, bank, setBank, onNext }: { profile: Profile; bank: Bank; setBank: (b: Bank) => void; onNext: () => void }) {
  const field = (key: keyof Bank) => (e: React.ChangeEvent<HTMLInputElement>) => setBank({ ...bank, [key]: e.target.value });
  const usa = profile.region === 'USA';
  return (
    <div className="space-y-6">
      <StepHeader icon={User} title="Profile & bank details" text="Check that your details are right, then tell us where to pay your salary." />

      <dl className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2.5 text-xs">
        <div className="flex justify-between gap-4"><dt className="font-semibold text-slate-500">Full Name</dt><dd className="font-semibold text-slate-900 text-right">{profile.fullName}</dd></div>
        <div className="flex justify-between gap-4"><dt className="font-semibold text-slate-500">Email</dt><dd className="font-semibold text-slate-900 text-right break-all">{profile.email}</dd></div>
      </dl>

      <div className="space-y-4">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Bank details (for salaries)</h3>
        <FormField label="Bank Name *"><Input value={bank.bankName} onChange={field('bankName')} placeholder="e.g. Chase Bank / Habib Bank" autoComplete="off" fieldSize="lg" /></FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Account Number *"><Input value={bank.accountNumber} onChange={field('accountNumber')} placeholder="Your account number" inputMode="numeric" autoComplete="off" fieldSize="lg" /></FormField>
          <FormField label={`${bankIdLabel(profile.region)} *`}><Input value={bank.iban} onChange={field('iban')} placeholder={usa ? 'e.g. 021000021 (9 digits)' : 'e.g. PK36SCBL0000001123456702'} autoComplete="off" fieldSize="lg" /></FormField>
        </div>
      </div>

      <StepActions onNext={onNext} nextLabel="Confirm & continue" />
    </div>
  );
}
