'use client';

import React, { useState } from 'react';
import { changeOwnPassword } from '@/lib/hrData';
import { errMsg } from '@/lib/errors';
import { useActionToast } from '@/components/ui/ActionToastHost';
import { FormField } from '@/components/ui/FormField';
import { FormModal } from '@/components/ui/FormModal';
import { PasswordInput } from '@/components/ui/PasswordInput';

// "Change Password" for the signed-in person (employee, HR or Admin). The current password is checked on the server
// by changeOwnPassword (bcrypt-aware); the browser never sees the stored value. Mount it only while open, so the
// fields start empty.
export function ChangePasswordModal({ logTag, onChanged, onClose }: { logTag: string; onChanged?: () => void; onClose: () => void }) {
  const { showToast } = useActionToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if (!current || !next || !confirm) return setError('Please fill in all fields.');
    if (next.length < 6) return setError('New password must be at least 6 characters.');
    if (next === current) return setError('New password must be different from current password.');
    if (next !== confirm) return setError('New passwords do not match.');

    setBusy(true);
    try {
      await changeOwnPassword(current, next);
      onChanged?.();
      onClose();
      showToast({ type: 'success', message: 'Password updated successfully!' });
    } catch (err) {
      console.error(`[${logTag}] Password update error:`, err);
      setError(errMsg(err, 'Failed to change password. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal title="Change Password" onClose={onClose} onSubmit={submit} busy={busy} error={error} submitLabel="Update Password">
      <FormField label="Current Password" size="md"><PasswordInput value={current} onChange={e => setCurrent(e.target.value)} placeholder="Enter current password" autoComplete="current-password" /></FormField>
      <FormField label="New Password" size="md"><PasswordInput value={next} onChange={e => setNext(e.target.value)} placeholder="Min. 6 characters" autoComplete="new-password" /></FormField>
      <FormField label="Confirm New Password" size="md"><PasswordInput value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat new password" autoComplete="new-password" /></FormField>
    </FormModal>
  );
}
