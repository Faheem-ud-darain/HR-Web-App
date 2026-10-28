'use client';

import React, { useEffect, useState } from 'react';
import { WarningCircleIcon as AlertCircle } from '@phosphor-icons/react/dist/ssr';
import { hrActions, updateProfileSelf, type Profile } from '@/lib/hrData';
import { useActionToast } from '@/components/ui/ActionToastHost';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { NoticeModal } from '@/components/ui/NoticeModal';

// Dialogs for the things a person edits about themselves on their own profile. Each is mounted only while open, so its
// fields start from the current values.

function FormFooter({ busy, onClose, submitLabel }: { busy: boolean; onClose: () => void; submitLabel: string }) {
  return (
    <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-slate-200">
      <Button type="button" variant="outline" size="md" disabled={busy} onClick={onClose}>Cancel</Button>
      <Button type="submit" size="lg" disabled={busy}>{submitLabel}</Button>
    </div>
  );
}

// Save helper shared by the two edit forms: validate, save on the person's own record, reload, toast.
function useSaveSelf(onSaved: () => Promise<unknown> | void, onClose: () => void) {
  const { showToast } = useActionToast();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (patch: Parameters<typeof updateProfileSelf>[0], successMessage: string, failureMessage: string) => {
    setBusy(true);
    try {
      await updateProfileSelf(patch);
      await onSaved();
      onClose();
      showToast({ type: 'success', message: successMessage });
    } catch (err) {
      console.error(err);
      setError(failureMessage);
    } finally {
      setBusy(false);
    }
  };
  return { error, setError, busy, save };
}

export function BankDetailsModal({ initial, region, onSaved, onClose }: {
  initial: { bankName?: string; accountNumber?: string; iban?: string };
  region?: string;
  onSaved: () => Promise<unknown> | void;
  onClose: () => void;
}) {
  const [bankName, setBankName] = useState(initial.bankName || '');
  const [accountNumber, setAccountNumber] = useState(initial.accountNumber || '');
  const [iban, setIban] = useState(initial.iban || '');
  const { error, setError, busy, save } = useSaveSelf(onSaved, onClose);
  const usa = region === 'USA';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (busy) return;
    if (!bankName.trim() || !accountNumber.trim() || !iban.trim()) return setError('Please fill in all bank detail fields.');
    save({ bankName: bankName.trim(), accountNumber: accountNumber.trim(), iban: iban.trim() }, 'Bank details updated successfully!', 'Failed to save bank details.');
  };

  return (
    <Modal isOpen onClose={onClose} title="Edit Bank Details">
      <form onSubmit={submit} className="space-y-4">
        <FormError>{error}</FormError>
        <FormField label="Bank Name" size="md"><Input type="text" value={bankName} onChange={e => setBankName(e.target.value)} fieldSize="md" placeholder="e.g. Habib Bank Limited" /></FormField>
        <FormField label="Account Number" size="md"><Input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} fieldSize="md" className="font-mono" placeholder="Enter your account number" /></FormField>
        <FormField label={usa ? 'Routing Number' : 'IBAN'} size="md"><Input type="text" value={iban} onChange={e => setIban(e.target.value)} fieldSize="md" className="font-mono" placeholder={usa ? 'e.g. 021000021' : 'e.g. PK12ABCD0000001234567890'} /></FormField>
        <p className="text-caption text-slate-400 leading-relaxed">Changes to your bank details are saved immediately and visible to HR/Payroll for your next salary cycle.</p>
        <FormFooter busy={busy} onClose={onClose} submitLabel={busy ? 'Saving…' : 'Save Bank Details'} />
      </form>
    </Modal>
  );
}

export function ContactNumbersModal({ initial, onSaved, onClose }: {
  initial: { personalPhone?: string; companyPhone?: string };
  onSaved: () => Promise<unknown> | void;
  onClose: () => void;
}) {
  const [personal, setPersonal] = useState(initial.personalPhone || '');
  const [company, setCompany] = useState(initial.companyPhone || '');
  const { error, setError, busy, save } = useSaveSelf(onSaved, onClose);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (busy) return;
    if (!personal.trim()) return setError('Please enter your own phone number.');
    save({ personalPhone: personal.trim(), companyPhone: company.trim() }, 'Contact numbers updated successfully!', 'Failed to save contact numbers.');
  };

  return (
    <Modal isOpen onClose={onClose} title="Edit Contact Numbers">
      <form onSubmit={submit} className="space-y-4">
        <FormError>{error}</FormError>
        <FormField label="Own Number" size="md"><Input type="tel" value={personal} onChange={e => setPersonal(e.target.value)} fieldSize="md" placeholder="e.g. +92 300 1234567" /></FormField>
        <FormField label="Company Allocated Number (if applicable)" size="md"><Input type="tel" value={company} onChange={e => setCompany(e.target.value)} fieldSize="md" placeholder="Leave blank if none issued" /></FormField>
        <p className="text-caption text-slate-400 leading-relaxed">Changes to your contact numbers are saved immediately and visible to HR/Admin.</p>
        <FormFooter busy={busy} onClose={onClose} submitLabel={busy ? 'Saving…' : 'Save Contact Numbers'} />
      </form>
    </Modal>
  );
}

// Self-service account deletion request (added for App Store review, Guideline 5.1.1(v): there was no way to start
// deleting your own account from inside the app). Actual deletion still goes through HR (payroll and legal records,
// the offboarding checklist, see hrActions.deleteEmployee's purge list), so this records the request and notifies
// HR/Admin at once instead of deleting instantly, which Apple accepts when immediate deletion is not practical.
export function useAccountDeletionRequest(email?: string) {
  const [request, setRequest] = useState<{ requestedAt: string } | null>(null);
  useEffect(() => {
    if (!email) return;
    let active = true;
    hrActions.getKV(`account_deletion_request_${email.toLowerCase()}`)
      .then(data => { if (active) setRequest(data || null); })
      .catch(() => { /* null if never requested */ });
    return () => { active = false; };
  }, [email]);
  return { request, setRequest };
}

export function DeleteAccountRequestModal({ profile, onRequested, onClose }: { profile: Profile; onRequested: (requestedAt: string) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const requestedAt = new Date().toISOString();
      await hrActions.setKV(`account_deletion_request_${profile.email.toLowerCase()}`, { email: profile.email, requestedAt });
      const actor = profile.fullName || profile.email;
      const message = `${actor} (${profile.email}) has requested their account be deleted.`;
      await hrActions.addNotification('all', 'hr', message, 'internal', actor, profile.email);
      await hrActions.addNotification('all', 'admin', message, 'internal', actor, profile.email);
      onRequested(requestedAt);
      onClose();
    } catch {
      setError("Couldn't send your request — please try again, or contact HR directly.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <NoticeModal
      title="Request Account Deletion"
      tone="rose"
      icon={AlertCircle}
      action={{ label: busy ? 'Sending…' : 'Send Deletion Request', onClick: send, variant: 'danger', disabled: busy }}
      closeLabel="Cancel"
      busy={busy}
      onClose={onClose}
      extra={error ? [{ tone: 'rose', icon: AlertCircle, text: error }] : []}
    >
      This sends HR and Admin an immediate request to delete your account and personal data. It doesn&apos;t delete anything automatically — HR will follow up with you to confirm before it&apos;s processed (records like payroll history may need to be retained for a period as required by law).
    </NoticeModal>
  );
}
