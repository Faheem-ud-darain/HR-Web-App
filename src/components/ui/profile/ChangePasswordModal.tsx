'use client';

import React, { useState } from 'react';
import { changeOwnPassword } from '@/lib/hrData';
import { errMsg } from '@/lib/errors';
import { useActionToast } from '@/components/ui/ActionToastHost';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { PasswordInput } from '@/components/ui/PasswordInput';

const FIELD = 'w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 md:py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900';

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (busy) return;
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
    <Modal isOpen onClose={onClose} title="Change Password">
      <form onSubmit={submit} className="space-y-4">
        <FormError>{error}</FormError>
        <FormField label="Current Password" size="md"><PasswordInput value={current} onChange={setCurrent} className={FIELD} placeholder="Enter current password" /></FormField>
        <FormField label="New Password" size="md"><PasswordInput value={next} onChange={setNext} className={FIELD} placeholder="Min. 6 characters" /></FormField>
        <FormField label="Confirm New Password" size="md"><PasswordInput value={confirm} onChange={setConfirm} className={FIELD} placeholder="Repeat new password" /></FormField>
        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="outline" size="md" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Updating…' : 'Update Password'}</Button>
        </div>
      </form>
    </Modal>
  );
}
