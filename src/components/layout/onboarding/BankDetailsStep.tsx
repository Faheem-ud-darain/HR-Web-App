'use client';

import React from 'react';
import type { useRouter } from 'next/navigation';
import { UserIcon as User, SignOutIcon as LogOut, CaretRightIcon as ChevronRight } from '@/components/ui/icons';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { hrActions, Profile } from '@/lib/hrData';
import { clearSession } from '@/lib/session';

interface BankDetailsStepProps {
  profile: Profile;
  bankName: string;
  setBankName: React.Dispatch<React.SetStateAction<string>>;
  accountNumber: string;
  setAccountNumber: React.Dispatch<React.SetStateAction<string>>;
  iban: string;
  setIban: React.Dispatch<React.SetStateAction<string>>;
  email: string | null;
  role: "admin" | "hr" | "employee" | "team_lead";
  router: ReturnType<typeof useRouter>;
  handleNextStep: () => void;
}

export function BankDetailsStep({ profile, bankName, setBankName, accountNumber, setAccountNumber, iban, setIban, email, role, router, handleNextStep }: BankDetailsStepProps) {
  return (
    <div className="space-y-4 md:space-y-6">
      <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
        <User className="h-4 w-4 md:h-5 md:w-5 text-orange-600" /> Step 1: Profile & Bank Details
      </h2>
      
      <div className="space-y-4">
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200/50 space-y-2.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-500">Full Name</span>
            <span className="font-semibold text-slate-900">{profile.fullName}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-500">Email</span>
            <span className="font-semibold text-slate-900">{profile.email}</span>
          </div>
        </div>
    
        <div className="space-y-3 pt-2">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Bank details (for Salaries)</h3>
          
          <div className="space-y-1">
            <FieldLabel size="tiny">Bank Name *</FieldLabel>
            <Input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. Chase Bank / Habib Bank"
              fieldSize="md"
            />
          </div>
    
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <FieldLabel size="tiny">Account Number *</FieldLabel>
              <Input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="10-16 digits"
                fieldSize="md"
              />
            </div>
             <div className="space-y-1">
               <FieldLabel size="tiny">
                 {profile?.region === 'USA' ? 'Routing Number *' : 'IBAN *'}
               </FieldLabel>
               <Input
                 type="text"
                 value={iban}
                 onChange={(e) => setIban(e.target.value)}
                 placeholder={profile?.region === 'USA' ? 'e.g. 021000021 (9 digits)' : 'e.g. PK98HABB...'}
                 fieldSize="md"
               />
             </div>
          </div>
        </div>
      </div>
    
      <div className="flex justify-between items-center pt-4 border-t border-slate-200 gap-3">
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={async () => {
            await hrActions.performLogout(email || '', role);
            clearSession();
            router.push('/auth');
          }}
          className="border border-slate-200"
        >
          <LogOut className="h-4 w-4" /> Back to Login
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={handleNextStep}
        >
          Confirm & Continue <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
