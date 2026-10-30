'use client';

import React, { useState } from 'react';
import { CheckCircleIcon as CheckCircle, ShieldCheckIcon as ShieldCheck } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PolicyView } from '@/components/ui/PolicyView';
import type { Profile } from '@/lib/hrData';
import { StepActions, StepHeader } from './StepParts';
import type { PolicyKey, useOnboardingForm } from './useOnboardingForm';

type Form = ReturnType<typeof useOnboardingForm>;

// The three documents to acknowledge. The handbook is the real one (the same page employees find under Policy) and the
// privacy policy is the public page; only the code of conduct is a short summary shown here.
const POLICIES: { key: PolicyKey; title: string; text: string; read: 'modal' | { href: string } }[] = [
  { key: 'conduct', title: 'Code of Conduct', text: 'Professional interaction guidelines and conflict resolution.', read: 'modal' },
  { key: 'handbook', title: 'Employee Handbook', text: 'Leave policies, accrual rules and settlements.', read: 'modal' },
  { key: 'privacy', title: 'Privacy & Data Policy', text: 'What data the app collects and how it is used.', read: { href: '/privacy' } },
];

// Step 4: read and tick each policy, sign with your full name, and submit for HR's review.
export function PoliciesSignOffStep({ profile, form, onSubmit }: { profile: Profile; form: Form; onSubmit: () => void }) {
  const [open, setOpen] = useState<PolicyKey | null>(null);
  const view = (p: (typeof POLICIES)[number]) => {
    form.markRead(p.key);
    if (p.read === 'modal') setOpen(p.key);
  };
  return (
    <div className="space-y-6">
      <StepHeader icon={ShieldCheck} title="Policies & sign-off" text="Read each document, then tick it to accept." />

      <ul className="space-y-3">
        {POLICIES.map(p => (
          <li key={p.key} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <Checkbox checked={form.accepted[p.key]} onChange={v => form.setAccepted(p.key, v)} disabled={!form.read[p.key]} hint={form.read[p.key] ? p.text : `${p.text} Read it first to accept.`}>{p.title}</Checkbox>
            {p.read === 'modal'
              ? <Button type="button" variant="outline" size="sm" onClick={() => view(p)}>Read</Button>
              : <a href={p.read.href} target="_blank" rel="noopener noreferrer" onClick={() => form.markRead(p.key)} className="inline-flex min-h-[36px] items-center rounded-xl border border-slate-200 bg-white px-2.5 text-caption font-bold text-slate-700 hover:bg-slate-50">Read</a>}
          </li>
        ))}
      </ul>

      <FormField label="Digital signature" hint={`Type your full name exactly as it appears here: ${profile.fullName}`}>
        <Input value={form.signature} onChange={e => form.setSignature(e.target.value)} placeholder={profile.fullName} autoComplete="off" fieldSize="lg" />
      </FormField>

      <StepActions onBack={form.back} onNext={onSubmit} loading={form.saving} nextVariant="success" nextLabel={<><CheckCircle weight="fill" className="h-4 w-4" aria-hidden="true" /> Complete onboarding</>} />

      {open && (
        <Modal isOpen onClose={() => setOpen(null)} title={POLICIES.find(p => p.key === open)?.title || ''} className="md:max-w-3xl">
          {open === 'handbook'
            ? <PolicyView embedded />
            : <p className="text-sm text-slate-700 leading-relaxed font-medium">DelCargo is committed to a workplace that is respectful, inclusive and professional. Everyone is expected to act with integrity, communicate openly across remote teams, and take conflicts to HR. Performance is reviewed periodically.</p>}
        </Modal>
      )}
    </div>
  );
}
