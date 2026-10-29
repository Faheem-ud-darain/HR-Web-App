'use client';

import React from 'react';
import { UserIcon as User } from '@/components/ui/icons';
import { BankFields } from '@/components/ui/BankFields';
import type { Profile } from '@/lib/hrData';
import type { BankDetails } from '@/lib/core/onboarding';
import { StepActions, StepHeader } from './StepParts';

// Step 1: who you are (read-only, from the account HR made) and where salary is paid.
export function BankDetailsStep({ profile, bank, setBank, onNext }: { profile: Profile; bank: BankDetails; setBank: (b: BankDetails) => void; onNext: () => void }) {
  return (
    <div className="space-y-6">
      <StepHeader icon={User} title="Profile & bank details" text="Check that your details are right, then tell us where to pay your salary." />

      <dl className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2.5 text-xs">
        <div className="flex justify-between gap-4"><dt className="font-semibold text-slate-500">Full Name</dt><dd className="font-semibold text-slate-900 text-right">{profile.fullName}</dd></div>
        <div className="flex justify-between gap-4"><dt className="font-semibold text-slate-500">Email</dt><dd className="font-semibold text-slate-900 text-right break-all">{profile.email}</dd></div>
      </dl>

      <div className="space-y-4">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Bank details (for salaries)</h3>
        <BankFields bank={bank} onChange={setBank} region={profile.region} fieldSize="lg" />
      </div>

      <StepActions onNext={onNext} nextLabel="Confirm & continue" />
    </div>
  );
}
