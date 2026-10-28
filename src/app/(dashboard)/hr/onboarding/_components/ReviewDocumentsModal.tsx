'use client';

import React, { useState } from 'react';
import { DownloadSimpleIcon as Download, EyeIcon as Eye, FileTextIcon as FileText, ShieldCheckIcon as ShieldCheck, XCircleIcon as XCircle } from '@phosphor-icons/react/dist/ssr';
import { approveOnboardingServer, displayName, rejectOnboardingServer, useProfileDocuments, type Profile } from '@/lib/hrData';
import { getSessionEmail } from '@/lib/session';
import { onboardingStatus } from '@/lib/core/onboarding';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { FormError } from '@/components/ui/FormError';
import { Textarea } from '@/components/ui/Input';
import { DocumentPreviewModal } from '@/components/ui/lazy';
import { Modal } from '@/components/ui/Modal';

// One uploaded file: its name, what kind it is, and Preview / Download.
function DocumentFileRow({ name, kind, url, onPreview }: { name: string; kind: string; url: string; onPreview: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg p-3">
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="h-4 w-4 text-orange-600 shrink-0" />
        <span className="truncate">{name}</span>
        <span className="text-[10px] text-slate-400 font-medium bg-slate-100 px-2 py-0.5 rounded">{kind}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button type="button" onClick={onPreview} className="text-xs font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2.5 py-1.5 rounded-md flex items-center gap-1 transition-colors">
          <Eye className="h-3.5 w-3.5" /> Preview
        </button>
        <a href={url} download={name} aria-label={`Download ${name}`} className="text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-md flex items-center gap-1 transition-colors">
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
    <p className="text-[9px] font-bold text-slate-400 uppercase">{label}</p>
    <p className="text-xs font-semibold text-slate-800">{value}</p>
  </div>
);

// HR's review of someone's onboarding submission: their CV, identity documents, passport and bank details, then
// Approve (unlocks their dashboard) or Reject with a reason the employee will see. The scans are fetched on demand,
// only while this dialog is open (they are not part of the eager employees list).
export function ReviewDocumentsModal({ employee, onDone, onClose }: { employee: Profile; onDone: () => Promise<unknown> | void; onClose: () => void }) {
  const { data: docs } = useProfileDocuments(employee.id);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(employee.approvalRejectionReason || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  const decide = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !reason.trim()) return setError('Please leave a short reason so the employee knows what to fix.');
    setBusy(true);
    setError('');
    try {
      const reviewer = getSessionEmail() || '';
      if (action === 'approve') await approveOnboardingServer(employee, reviewer);
      else await rejectOnboardingServer(employee, reviewer, reason.trim());
      await onDone();
      onClose();
    } catch (err) {
      console.error(`${action === 'approve' ? 'Approve' : 'Reject'} onboarding failed:`, err);
      setError(`Could not ${action} this employee. Please try again.`);
    } finally {
      setBusy(false);
    }
  };

  const identityDocs = docs?.identityDocs || [];
  const noDocuments = !docs?.cvFileData && identityDocs.length === 0 && !docs?.passportFileData;
  const status = onboardingStatus(employee);

  return (
    <>
      <Modal isOpen onClose={onClose} title="Review Onboarding Documents" className="md:max-w-2xl">
        <div className="space-y-5 pt-1">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">{displayName(employee, 'hr')}</p>
              <p className="text-xs text-slate-500 font-semibold">{employee.email} · {employee.jobTitle || 'Staff'} · {employee.region || 'Pakistan'}</p>
            </div>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>

          <FormError>{error}</FormError>

          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Uploaded Documents</h4>
            {docs?.cvFileData && docs.cvFileName && <DocumentFileRow name={docs.cvFileName} kind="CV" url={docs.cvFileData} onPreview={() => setPreview({ url: docs.cvFileData!, name: docs.cvFileName! })} />}
            {identityDocs.map((d, i) => <DocumentFileRow key={i} name={d.name} kind="Identity Doc" url={d.data} onPreview={() => setPreview({ url: d.data, name: d.name })} />)}
            {docs?.passportFileData && docs.passportFileName && <DocumentFileRow name={docs.passportFileName} kind="Passport" url={docs.passportFileData} onPreview={() => setPreview({ url: docs.passportFileData!, name: docs.passportFileName! })} />}
            {noDocuments && <p className="text-xs text-slate-400 italic font-semibold">No documents on file.</p>}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <Field label="Bank" value={employee.bankName || '—'} />
              <Field label="Account / IBAN" value={`${employee.accountNumber || '—'} · ${employee.iban || '—'}`} />
            </div>
          </div>

          {rejecting ? (
            <div className="space-y-3 pt-3 border-t border-slate-200">
              <FieldLabel size="sm">Reason for rejection *</FieldLabel>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="e.g. CNIC back-side image is blurry, please re-upload." fieldSize="sm" />
              <div className="flex gap-3">
                <Button type="button" variant="outline" size="md" className="flex-1" onClick={() => setRejecting(false)}>Back</Button>
                <Button type="button" variant="danger" size="md" className="flex-1" disabled={busy} onClick={() => decide('reject')}>{busy ? 'Submitting…' : 'Confirm Rejection'}</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 pt-3 border-t border-slate-200">
              <Button type="button" variant="outline" size="md" className="flex-1 !text-rose-600 !border-rose-200 hover:!bg-rose-50" onClick={() => setRejecting(true)}>
                <XCircle className="h-3.5 w-3.5 mr-1.5" /> Reject
              </Button>
              <Button type="button" variant="success" size="md" className="flex-1" disabled={busy} onClick={() => decide('approve')}>
                <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> {busy ? 'Approving…' : 'Approve & Unlock Dashboard'}
              </Button>
            </div>
          )}
        </div>
      </Modal>

      {preview && <DocumentPreviewModal url={preview.url} name={preview.name} onClose={() => setPreview(null)} />}
    </>
  );
}
