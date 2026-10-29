'use client';

import React from 'react';
import type { Profile } from '@/lib/hrData';
import type { SessionRole } from '@/lib/session';
import { SignOutIcon as LogOut } from '@/components/ui/icons';
import { AvatarCropperModal } from '@/components/ui/lazy';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/FormError';
import { Stepper } from '@/components/ui/Stepper';
import { GatePage } from '@/components/layout/GatePage';
import { useAccountActions } from '@/components/layout/topnav/useAccountActions';
import { ONBOARDING_STEPS } from '@/lib/core/onboarding';
import { BankDetailsStep } from '@/components/layout/onboarding/BankDetailsStep';
import { DocumentsStep } from '@/components/layout/onboarding/DocumentsStep';
import { GuideStep } from '@/components/layout/onboarding/GuideStep';
import { PoliciesSignOffStep } from '@/components/layout/onboarding/PoliciesSignOffStep';
import { useOnboardingForm } from '@/components/layout/onboarding/useOnboardingForm';

// The employee's onboarding wizard (bank details, documents, guide, sign-off). The dashboard layout shows it in place of
// the app while the signed-in employee's profile has `onboardingCompleted === false`. All state and rules live in
// useOnboardingForm; each step is its own component.
export function OnboardingFlow({ profile, email, role }: { profile: Profile; email: string | null; role: SessionRole }) {
  const form = useOnboardingForm(profile);
  const { signOut } = useAccountActions({ role, email });
  const { step } = form;
  // Someone HR sent back (their documents were rejected) sees why, above the steps.
  const sentBack = profile.approvalStatus === 'rejected' && profile.approvalRejectionReason;

  return (
    <GatePage>
      <div className="flex items-start justify-between gap-3 pb-5 mb-6 border-b border-slate-200">
        <div className="space-y-1.5">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Employee Onboarding</h1>
          <p className="text-xs md:text-sm text-slate-500">Welcome to DelCargo! Complete these steps to open your dashboard.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={signOut} title="Sign out and change account" className="shrink-0">
          <LogOut className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>

      <div className="mb-6"><Stepper steps={ONBOARDING_STEPS} current={step} label="Onboarding progress" /></div>

      <div className="space-y-4">
        {sentBack && <FormError>HR sent your documents back: {profile.approvalRejectionReason}</FormError>}
        <FormError>{form.error}</FormError>

        {step === 1 && <BankDetailsStep profile={profile} bank={form.bank} setBank={form.setBank} onNext={form.next} />}
        {step === 2 && <DocumentsStep profile={profile} form={form} onSkip={form.next} />}
        {step === 3 && <GuideStep onBack={form.back} onNext={form.next} />}
        {step === 4 && <PoliciesSignOffStep profile={profile} form={form} onSubmit={() => form.submit(email)} />}
      </div>

      <AvatarCropperModal
        file={form.pendingPhoto}
        onClose={() => form.setPendingPhoto(null)}
        onSave={webp => { form.setPicture(webp); form.setPendingPhoto(null); }}
      />
    </GatePage>
  );
}
