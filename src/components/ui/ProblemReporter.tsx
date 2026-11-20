'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  const [result, setResult] = useState<'sent' | 'kept' | 'failed' | null>(null);
  // Each time the popup opens it is a new session: an answer that arrives for an earlier one must not touch the new draft.
  const session = useRef(0);

  useEffect(() => installIssueCapture(), []);
  useEffect(() => onOpenProblemReport(() => { session.current += 1; setNote(''); setResult(null); setBusy(false); setOpen(true); }), []);

  if (!open) return null;
  const close = () => setOpen(false);

  if (result) {
    return (
      <FormModal title="Report a problem" onClose={close} onSubmit={close} submitLabel="Close">
        <p className="text-sm text-slate-700">
          {result === 'sent' ? 'Thank you. HR and Admin have your report, with the details they need to find the cause.' : result === 'kept' ? 'We could not reach our server right now, so your report is saved on this device and will be sent as soon as the connection is back. You do not need to do anything.' : 'Your report could not be sent or saved on this device. Please tell HR what happened and which page you were on.'}
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
        const mine = session.current;
        setBusy(true);
        const delivered = await submitReport({ kind: 'manual', title: 'Problem reported by employee', message: note.trim().slice(0, 200) || 'Problem reported by employee', note: note.trim() });
        if (mine !== session.current) return;
        setBusy(false);
        setResult(delivered === 'sent' ? 'sent' : delivered === 'queued' ? 'kept' : 'failed');
      }}
      note="HR and Admin will also see technical details: the page you are on, your device and browser, your connection, and the last few things the app did. Never your password."
    >
      <FormField label="What happened?" hint="For example: I pressed Absence Records and it showed an error.">
        <Textarea value={note} onChange={e => setNote(e.target.value)} rows={4} maxLength={1500} placeholder="Describe what you did and what you saw (you can leave this empty)" />
      </FormField>
    </FormModal>
  );
}
