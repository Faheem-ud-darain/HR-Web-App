'use client';

import React, { useState } from 'react';
import { WarningIcon as AlertTriangle, CheckCircleIcon as CheckCircle2 } from '@/components/ui/icons';
import { hrActions, type CareerPosition } from '@/lib/hrData';
import { errMsg } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface ApplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: CareerPosition | null;
  // Only outside candidates ("public") may apply; staff are blocked here as a second line of defence.
  canApply: boolean;
  onSubmitted: () => void;
}

// The application form for external candidates.
export function ApplyModal({ isOpen, onClose, job, canApply, onSubmitted }: ApplyModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!canApply || !name || !email || !job) return;

    setBusy(true);
    try {
      // The duplicate check (same email + position) and the write both happen server-side in one call
      // (src/app/api/careers/apply): applicants have no app account, so that route is public by design and is
      // the only writer left for hr_career_applications.
      try {
        await hrActions.submitCareerApplicationPublic({ positionId: job.id, positionTitle: job.title, applicantName: name, applicantEmail: email, coverLetter });
      } catch (err) {
        setError(errMsg(err, 'Could not submit your application. Please try again.'));
        return;
      }
      // HR/Admin are notified by that route (best effort), so a failure there cannot hide a saved application
      // from the applicant or make a retry hit the duplicate guard.
      onSubmitted();
      setSuccess('Application submitted successfully! Our HR team will get back to you.');
      setTimeout(() => {
        onClose();
        setName('');
        setEmail('');
        setCoverLetter('');
        setSuccess('');
      }, 2000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Apply: ${job?.title}`}>
      <form onSubmit={submit} className="space-y-4 pt-1">
        {success ? (
          <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-800 text-xs font-semibold leading-relaxed">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mb-1" />
            {success}
          </div>
        ) : (
          <>
            {error && (
              <div className="p-3 text-xs bg-rose-50 text-rose-700 border border-rose-100 rounded-xl font-semibold flex items-start gap-1.5">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" /> {error}
              </div>
            )}
            <FormField label="Full Name *">
              <Input type="text" required value={name} onChange={e => setName(e.target.value)} fieldSize="soft" placeholder="e.g. John Doe" />
            </FormField>
            <FormField label="Email Address *">
              <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} fieldSize="soft" placeholder="e.g. applicant@company.com" />
            </FormField>
            <FormField label="Cover Letter / Note">
              <Textarea rows={3} value={coverLetter} onChange={e => setCoverLetter(e.target.value)} fieldSize="lg" className="resize-none" placeholder="Say hello or detail your fit..." />
            </FormField>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <Button type="button" variant="outline" size="md" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit Application'}</Button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
