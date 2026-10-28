import React from 'react';
import { AlertTriangle, Calendar, CheckCircle2, DollarSign, XCircle } from 'lucide-react';
import { formatMoney, type Profile } from '@/lib/hrData';

const Check = ({ done, children }: { done: boolean; children: React.ReactNode }) => (
  <p className="flex items-center gap-1.5">
    {done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-rose-500" />} {children}
  </p>
);

const Money = ({ label, amount, region }: { label: string; amount: number; region: Profile['region'] }) => (
  <p className="flex items-center gap-1.5 mt-1 pt-1.5 border-t border-rose-200/50">
    <DollarSign className="h-3.5 w-3.5" /> {label}: <span className="font-bold">{formatMoney(amount, region)}</span>
  </p>
);

// What was recorded when this employee was offboarded: the clearance checklist, the final payouts and the notes.
export function OffboardingSummary({ profile }: { profile: Profile }) {
  const s = profile.offboardingStatus;
  if (!profile.offboarded || !s) return null;
  return (
    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl space-y-2 text-xs">
      <p className="font-bold text-rose-800 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Offboarding Clearance</p>
      <div className="space-y-1 text-[11px] font-semibold text-rose-700">
        <p className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> Offboard Date: {profile.offboardDate}</p>
        <div className="mt-1 space-y-1">
          <Check done={s.itClearance}>IT Hardware Clearance</Check>
          <Check done={s.financeClearance}>Finance Settlement</Check>
          <Check done={s.hrClearance}>HR Official Signoff</Check>
          {profile.companyPhone && <Check done={!!s.companyNumberReturned}>Company Number ({profile.companyPhone}) Returned</Check>}
        </div>
        {s.finalLeavePayout !== undefined && <Money label="Final PTO/Sick Payout" amount={s.finalLeavePayout} region={profile.region} />}
        {s.finalReservedPayout !== undefined && <Money label="Final Reserved Salary Payout" amount={s.finalReservedPayout} region={profile.region} />}
        {s.notes && <p className="mt-2 text-slate-600 border-t border-rose-200/50 pt-1.5 font-medium leading-relaxed whitespace-pre-wrap break-words">Notes: {s.notes}</p>}
      </div>
    </div>
  );
}
