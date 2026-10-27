'use client';

import React, { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { hrActions } from '@/lib/hrData';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface ForwardToHrAdminModalProps {
  sender: { email: string; name: string; role: 'hr' | 'admin' };
  kind: 'ticket' | 'announcement' | 'chat';
  // What is recorded on the forwarded message: a label (title or team name) and the id to link back to.
  sourceLabel: string;
  sourceId: string;
  // The preview box: a small heading, an optional bold title, and the body text.
  heading: string;
  title?: string;
  body?: string;
  attachmentName?: string;
  attachmentUrl?: string;
  // "ticket" / "announcement" / "message": used in the error text.
  noun: string;
  onClose: () => void;
}

// "Forward to HR & Admin": HR's and Admin's private line to each other, with an optional note. One dialog for all
// three places that offer it (a ticket, an announcement, a chat message); hrActions.forwardToHrAdminLine is the
// one mechanism behind them, and every forward notifies the other role. Re-forwarding is unrestricted: each forward
// is a new hr_messages row. Mounted only while something is being forwarded, so the note starts empty every time.
export function ForwardToHrAdminModal({ sender, kind, sourceLabel, sourceId, heading, title, body, attachmentName, attachmentUrl, noun, onClose }: ForwardToHrAdminModalProps) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await hrActions.forwardToHrAdminLine(sender.email, sender.name, sender.role, kind, sourceLabel, sourceId, note, attachmentUrl, attachmentName);
      onClose();
    } catch (err) {
      console.error(`Forward ${noun} failed:`, err);
      setError(`Could not forward that ${noun}. Please try again.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !busy && onClose()} title="Forward to HR & Admin">
      <div className="space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{heading}</p>
          {title && <p className="text-xs font-bold text-slate-800 break-words">{title}</p>}
          <p className={`text-xs mt-1 line-clamp-3 whitespace-pre-wrap break-words ${title ? 'text-slate-500' : 'font-semibold text-slate-700 mt-0'}`}>
            {body || <span className="italic text-slate-400">(no text)</span>}
          </p>
          {attachmentName && (
            <p className="text-[11px] font-bold text-slate-500 mt-1.5 flex items-center gap-1">
              <FileText className="h-3 w-3 shrink-0" /> {attachmentName}
            </p>
          )}
        </div>
        <FormField label="Note (optional)">
          <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Add a note for HR & Admin…" fieldSize="md" className="resize-none" />
        </FormField>
        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="md" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="button" variant="primary" size="md" disabled={busy} onClick={submit}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {busy ? 'Forwarding…' : 'Forward'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
