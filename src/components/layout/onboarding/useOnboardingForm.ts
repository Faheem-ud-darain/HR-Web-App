'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { hrActions, updateProfileSelf, type Profile } from '@/lib/hrData';
import { compressImageToWebP, fileToDataUrl, MAX_DOCUMENT_IMAGE_BYTES, validatePdfSize } from '@/lib/imageCompressor';
import {
  DOCS_BUDGET_BYTES, docsBytes, documentPages, identityScansNeeded, isPdf, overBudgetMessage, validateBankDetails, validateSignature,
} from '@/lib/core/onboarding';

export type PolicyKey = 'conduct' | 'handbook' | 'privacy';
type Doc = { name: string; data: string };
type Busy = 'cv' | 'identity' | 'passport' | null;

// Everything the onboarding wizard remembers and does: the step it is on, what has been typed and uploaded, the rules
// for moving on, and the final save. The screens just show it. Nothing is sent to the server until the last step.
export function useOnboardingForm(profile: Profile) {
  const queryClient = useQueryClient();
  const region = profile.region;
  const [step, setStep] = useState(1);
  const [page, setPage] = useState(1); // the page within the documents step
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Someone sent back by HR starts with the bank details they gave last time.
  const [bank, setBank] = useState({ bankName: profile.bankName || '', accountNumber: profile.accountNumber || '', iban: profile.iban || '' });
  const [picture, setPicture] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [cv, setCv] = useState<Doc | null>(null);
  const [identity, setIdentity] = useState<Doc[]>([]);
  const [passport, setPassport] = useState<Doc | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  const [read, setRead] = useState<Record<PolicyKey, boolean>>({ conduct: false, handbook: false, privacy: false });
  const [accepted, setAccepted] = useState<Record<PolicyKey, boolean>>({ conduct: false, handbook: false, privacy: false });
  const [signature, setSignature] = useState('');

  const scansNeeded = identityScansNeeded(region);
  const pages = documentPages(region);

  // How much of the documents' shared size budget is left when `except` is not counted (the file being replaced).
  const budgetLeft = (except?: Doc | null) => DOCS_BUDGET_BYTES - docsBytes(cv?.data, ...identity.map(d => d.data), passport?.data) + (except ? except.data.length : 0);

  // Reads one chosen file into a stored document: a PDF as it is, an image squeezed to fit what is left of the budget.
  const readDocument = async (file: File, kind: 'pdf' | 'image', except?: Doc | null): Promise<Doc | null> => {
    setError('');
    const left = budgetLeft(except);
    try {
      if (kind === 'pdf') {
        if (!isPdf(file)) { setError('The CV must be a PDF file.'); return null; }
        const tooBig = validatePdfSize(file);
        if (tooBig) { setError(tooBig); return null; }
        const data = await fileToDataUrl(file);
        if (data.length > left) { setError(overBudgetMessage(left)); return null; }
        return { name: file.name, data };
      }
      if (left < 20_000) { setError(overBudgetMessage(left)); return null; }
      return { name: file.name, data: await compressImageToWebP(file, 0.75, Math.min(MAX_DOCUMENT_IMAGE_BYTES, left)) };
    } catch (err) {
      console.error('Reading a document failed:', err);
      // compressImageToWebP says what is wrong (a HEIC photo, a file too big to shrink) in words worth showing.
      setError(err instanceof Error ? err.message : 'Could not read that file. Please try again.');
      return null;
    }
  };

  // One handler for all three slots: mark the slot busy, read the file, store it.
  const pick = (kind: Exclude<Busy, null>, format: 'pdf' | 'image', store: (doc: Doc) => void, except?: Doc | null) => async (file: File | undefined) => {
    if (!file) return;
    setBusy(kind);
    const doc = await readDocument(file, format, except);
    setBusy(null);
    if (doc) store(doc);
  };

  const documents = {
    cv, identity, passport, picture, busy,
    pickCv: pick('cv', 'pdf', setCv, cv),
    pickIdentity: pick('identity', 'image', d => setIdentity(prev => [...prev, d].slice(0, scansNeeded))),
    pickPassport: pick('passport', 'image', setPassport, passport),
    removeCv: () => setCv(null),
    removeIdentity: (i: number) => setIdentity(prev => prev.filter((_, n) => n !== i)),
    removePassport: () => setPassport(null),
    removePicture: () => { setPicture(null); setPendingPhoto(null); },
  };

  const next = () => {
    setError('');
    if (step === 1) {
      const problem = validateBankDetails(bank, region);
      if (problem) return setError(problem);
      setStep(2); setPage(1);
    } else if (step === 2) {
      if (page === 1 && (!picture || !cv)) return setError('Required: a profile picture and your CV (PDF).');
      if (page === 2 && identity.length < scansNeeded) {
        return setError(`Required: ${region === 'USA' ? 'a driver licence or work permit scan' : 'both sides of your CNIC'} (${identity.length}/${scansNeeded} uploaded).`);
      }
      if (page < pages) setPage(page + 1); else setStep(3);
    } else {
      setStep(step + 1);
    }
  };

  const back = () => {
    setError('');
    if (step === 2 && page > 1) setPage(page - 1);
    else { setStep(step - 1); if (step === 3) setPage(pages); }
  };

  const submit = async (email: string | null) => {
    setError('');
    const problem = validateSignature(signature, profile.fullName);
    if (problem) return setError(problem);
    if (!accepted.conduct || !accepted.handbook || !accepted.privacy) return setError('Please read and accept all policy documents.');
    if (!email) return setError('You are signed out. Please sign in again.');
    setSaving(true);
    try {
      // The server sorts these into the profile's own columns and the documents row, and always files the submission as
      // "pending", so the dashboard stays locked until HR or Admin approves.
      await updateProfileSelf({
        ...bank,
        profilePicture: picture || undefined,
        onboardingCompleted: true,
        cvFileName: cv?.name, cvFileData: cv?.data,
        identityDocs: identity.length ? identity.map((d, i) => ({ name: d.name || (region === 'USA' ? 'License' : i === 0 ? 'CNIC Front' : 'CNIC Back'), data: d.data })) : undefined,
        passportFileName: passport?.name, passportFileData: passport?.data,
        approvalStatus: 'pending',
      });
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
      setSaving(false);
      return setError('Failed to save onboarding data. Please try again.');
    }
    // The save worked. Telling HR is best effort: if it fails the person is still submitted, so do not ask them to retry.
    await Promise.allSettled(['hr', 'admin'].map(r => hrActions.addNotification('all', r, `${profile.fullName} completed onboarding and is waiting for document approval.`)));
    // Refresh the profile: the layout then shows the "awaiting approval" screen in place of the wizard.
    await queryClient.invalidateQueries({ queryKey: ['hr_profiles'] });
    setSaving(false);
  };

  return {
    step, page, pages, scansNeeded, error, saving,
    bank, setBank, documents, pendingPhoto, setPendingPhoto, setPicture,
    read, markRead: (k: PolicyKey) => setRead(r => ({ ...r, [k]: true })),
    accepted, setAccepted: (k: PolicyKey, v: boolean) => setAccepted(a => ({ ...a, [k]: v })),
    signature, setSignature, next, back, submit,
  };
}
