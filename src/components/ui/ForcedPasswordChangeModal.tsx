'use client';

import React, { useState } from 'react';
import { KeyIcon as KeyRound, ShieldCheckIcon as ShieldCheck } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/FormError';
import { Modal } from '@/components/ui/Modal';
import { Profile, changeOwnPassword } from '@/lib/hrData';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { errMsg } from '@/lib/errors';

interface ForcedPasswordChangeModalProps {
  profile: Profile | null | undefined;
  onChanged: () => void;
}

// Plan 013 step 2: a hard gate shown the first time an employee (or HR/
// Admin) logs in after either onboarding approval or an admin-triggered
// password reset — see admin/profile/route.ts's approveOnboarding/
// resetPassword actions, which are the only two places `mustChangePassword`
// gets set on the hr_profile_extra_ overlay. The point is that an
// HR-issued temp password shouldn't quietly remain the account's real
// password forever; this forces the swap once, right after it matters,
// rather than leaving it to the employee's discretion.
//
// Same non-dismissible-except-its-own-action shape as AbsentPopup/
// AnnouncementPopup (the shared <Modal> with dismissible={false}) — there is deliberately no way to skip this. Reuses
// changeOwnPassword (the same self-service call the Profile pages already
// use), which verifies the CURRENT password server-side — the employee
// still needs to know the temp password HR gave them to get through this,
// which is the correct check (proves they're the one who received it).
export function ForcedPasswordChangeModal({ profile, onChanged }: ForcedPasswordChangeModalProps) {
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!profile?.mustChangePassword) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (saving) return;

    if (!currentPass || !newPass || !confirmPass) {
      setError('Please fill in all fields.');
      return;
    }
    if (newPass.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPass === currentPass) {
      setError('New password must be different from your current one.');
      return;
    }
    if (newPass !== confirmPass) {
      setError('New passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      await changeOwnPassword(currentPass, newPass);
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
      onChanged();
    } catch (err) {
      setError(errMsg(err, 'Could not update your password. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      dismissible={false}
      onClose={() => {}}
      title="Set a new password to continue"
      eyebrow="Action Required"
      icon={<KeyRound weight="duotone" className="h-5 w-5 text-orange-600" aria-hidden="true" />}
      footer={<Button type="submit" form="forced-password-change" variant="primary" fullWidth loading={saving}><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Set New Password</Button>}
    >
      <form id="forced-password-change" onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm text-slate-700 leading-relaxed">
          Your account was just approved (or your password was reset by HR/Admin). For security, you need to
          replace the temporary password you were given with one only you know before continuing.
        </p>

        <FormField label="Current (Temporary) Password">
          <Input type="password" value={currentPass} onChange={e => setCurrentPass(e.target.value)} fieldSize="soft" autoComplete="current-password" />
        </FormField>
        <FormField label="New Password">
          <Input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} fieldSize="soft" autoComplete="new-password" />
        </FormField>
        <FormField label="Confirm New Password">
          <Input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} fieldSize="soft" autoComplete="new-password" />
        </FormField>

        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
