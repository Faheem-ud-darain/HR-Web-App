'use client';

import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { HourglassHighIcon as Hourglass, ShieldWarningIcon as ShieldAlert } from '@/components/ui/icons';
import { updateProfileSelf, type Profile } from '@/lib/hrData';
import type { SessionRole } from '@/lib/session';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/FormError';
import { GatePage } from '@/components/layout/GatePage';
import { useAccountActions } from '@/components/layout/topnav/useAccountActions';

// What an employee sees once onboarding is submitted but HR/Admin has not approved it: either "awaiting approval" or, if
// the documents were rejected, why, with a button to go through the steps again. The dashboard unlocks by itself once
// the profile refreshes with an approval.
export function ApprovalGate({ profile, email, role }: { profile: Profile; email: string | null; role: SessionRole }) {
  const rejected = profile.approvalStatus === 'rejected';
  const { signOut } = useAccountActions({ role, email });
  const queryClient = useQueryClient();
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  // Sending the person back to the wizard is just marking onboarding as not done: it opens again, with the bank details
  // they gave and HR's note on top.
  const resubmit = async () => {
    setBusy(true);
    setError('');
    try {
      await updateProfileSelf({ onboardingCompleted: false });
      await queryClient.invalidateQueries({ queryKey: ['hr_profiles'] }); // the layout then shows the wizard again
    } catch {
      setError('Could not reopen the steps. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const Glyph = rejected ? ShieldAlert : Hourglass;
  return (
    <GatePage width="max-w-md">
      <div className="text-center space-y-5">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${rejected ? 'bg-rose-50' : 'bg-amber-50'}`}>
          <Glyph weight="duotone" className={`h-7 w-7 ${rejected ? 'text-rose-500' : 'text-amber-500'}`} aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-lg font-bold text-slate-900">{rejected ? 'Your documents need another look' : 'Almost there: waiting for HR approval'}</h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            {rejected
              ? 'HR or Admin reviewed your documents and found something to fix. Go through the steps again to send them in once more.'
              : 'You have finished onboarding, thank you! HR or Admin is checking your documents now. Your dashboard opens automatically once you are approved.'}
          </p>
        </div>
        {rejected && profile.approvalRejectionReason && <div className="text-left"><FormError>HR note: {profile.approvalRejectionReason}</FormError></div>}
        {error && <FormError>{error}</FormError>}
        <div className="space-y-2">
          {rejected && <Button variant="primary" size="lg" fullWidth loading={busy} onClick={resubmit}>Re-submit documents</Button>}
          <Button variant="secondary" size="lg" fullWidth disabled={busy} onClick={signOut}>Sign out</Button>
        </div>
      </div>
    </GatePage>
  );
}
