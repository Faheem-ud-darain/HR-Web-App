'use client';

import React, { useEffect, useState } from 'react';
import { FormModal } from '@/components/ui/FormModal';
import { FormField } from '@/components/ui/FormField';
import { Textarea } from '@/components/ui/Input';
import { installIssueCapture } from '@/lib/issueReports/capture';
import { onOpenProblemReport } from '@/lib/issueReports/open';
import { submitReport } from '@/lib/issueReports/send';

// Mounted once for the whole app. It starts the automatic problem capture and owns the "Report a problem" popup that the account menus open.
export function ProblemReporter() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<'sent' | 'kept' | null>(null);

  useEffect(() => installIssueCapture(), []);
  useEffect(() => onOpenProblemReport(() => { setNote(''); setResult(null); setOpen(true); }), []);

  if (!open) return null;
  const close = () => setOpen(false);

  if (result) {
    return (
      <FormModal title="Report a problem" onClose={close} onSubmit={close} submitLabel="Close">
        <p className="text-sm text-slate-700">
          {result === 'sent' ? 'Thank you. HR and Admin have your report, with the details they need to find the cause.' : 'We could not reach our server right now, so your report is saved on this device and will be sent as soon as the connection is back. You do not need to do anything.'}
        </p>
      </FormModal>
    );
  }

  return (
    <FormModal
      title="Report a problem"
      onClose={close}
      submitLabel="Send report"
      busy={busy}
      onSubmit={async () => {
        setBusy(true);
        const delivered = await submitReport({ kind: 'manual', title: 'Problem reported by employee', message: note.trim().slice(0, 200) || 'Problem reported by employee', note: note.trim() });
        setBusy(false);
        setResult(delivered ? 'sent' : 'kept');
      }}
      note="HR and Admin will also see technical details: the page you are on, your device and browser, your connection, and the last few things the app did. Never your password."
    >
      <FormField label="What happened?" hint="For example: I pressed Absence Records and it showed an error.">
        <Textarea value={note} onChange={e => setNote(e.target.value)} rows={4} maxLength={1500} placeholder="Describe what you did and what you saw (you can leave this empty)" />
      </FormField>
    </FormModal>
  );
}
