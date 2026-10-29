'use client';

import React from 'react';
import { FormField } from '@/components/ui/FormField';
import { Input, type FieldSize } from '@/components/ui/Input';
import type { Profile } from '@/lib/hrData';
import { bankIdLabel, isMobileWallet, type BankDetails } from '@/lib/core/onboarding';

// The three bank fields, in the wizard and in the profile's "Edit bank details": the bank (or wallet) name, the account
// number, and the IBAN (routing number in the USA; a mobile wallet such as JazzCash needs no IBAN).
export function BankFields({ bank, onChange, region, fieldSize = 'md' }: { bank: BankDetails; onChange: (bank: BankDetails) => void; region?: Profile['region']; fieldSize?: FieldSize }) {
  const usa = region === 'USA';
  const wallet = !usa && isMobileWallet(bank.bankName);
  const set = (key: keyof BankDetails) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...bank, [key]: e.target.value });
  const idLabel = bankIdLabel(region);
  return (
    <>
      <FormField label="Bank Name *"><Input value={bank.bankName} onChange={set('bankName')} placeholder={usa ? 'e.g. Chase Bank' : 'e.g. Habib Bank, JazzCash, Easypaisa'} autoComplete="off" fieldSize={fieldSize} /></FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Account Number *"><Input value={bank.accountNumber} onChange={set('accountNumber')} placeholder={wallet ? 'Mobile number, e.g. 03001234567' : 'Your account number'} inputMode={wallet ? 'tel' : 'text'} autoComplete="off" className="font-mono" fieldSize={fieldSize} /></FormField>
        <FormField label={wallet ? `${idLabel} (not needed for a wallet)` : `${idLabel} *`}><Input value={bank.iban} onChange={set('iban')} placeholder={usa ? 'e.g. 021000021 (9 digits)' : 'e.g. PK36SCBL0000001123456702'} autoComplete="off" className="font-mono" fieldSize={fieldSize} /></FormField>
      </div>
    </>
  );
}
