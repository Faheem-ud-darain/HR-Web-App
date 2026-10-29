'use client';

import React, { useRef, useState } from 'react';
import { WarningCircleIcon as AlertCircle, FileTextIcon as FileText, CircleNotchIcon as Loader2, PaperclipIcon as Paperclip, XIcon as X } from '@/components/ui/icons';
import { hrActions, type Profile } from '@/lib/hrData';
import { useActionToast } from '@/components/ui/ActionToastHost';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { fileToStoredData } from '@/lib/imageCompressor';
import type { TicketRole } from './ticketHelpers';

interface NewTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: Profile | null;
  role: TicketRole;
  currentEmail: string;
  // Called once the ticket (and its optional attachment) is saved, so the list can refresh.
  onCreated: () => void;
}

// "File a Ticket": department, title, description and an optional screenshot or PDF.
export function NewTicketModal({ isOpen, onClose, userProfile, role, currentEmail, onCreated }: NewTicketModalProps) {
  const { showToast } = useActionToast();
  const [department, setDepartment] = useState<'hr' | 'technical'>('hr');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The ticket once it exists: if attaching the file then fails, pressing File Ticket again only retries the
  // attachment instead of creating a second ticket.
  const createdRef = useRef<Awaited<ReturnType<typeof hrActions.createTicket>> | null>(null);

  const close = () => { onClose(); setFile(null); setFileError(''); createdRef.current = null; };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    setFileError('');
    setFile(picked);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !title || !desc || !userProfile) return;
    setFileError('');
    setBusy(true);
    let attaching = false;
    try {
      let attachment: { data: string; error: string | null } | null = null;
      if (file) {
        attachment = await fileToStoredData(file);
        if (attachment.error) { setFileError(attachment.error); return; }
      }

      const created = createdRef.current ?? await hrActions.createTicket({
        employeeName: userProfile.fullName,
        employeeEmail: userProfile.email,
        title,
        description: desc,
        department,
      });
      createdRef.current = created;
      attaching = true;

      // hr_tickets has no attachment column, so a file picked at filing time is attached as an immediate
      // follow-up reply on the new ticket (see createTicket's comment in hrData.ts).
      if (attachment && file) {
        await hrActions.addTicketReply(created, {
          senderName: userProfile.fullName,
          senderRole: role,
          senderEmail: currentEmail,
          message: '',
          attachmentName: file.name,
          attachmentUrl: attachment.data,
          attachmentSize: file.size,
        });
      }

      createdRef.current = null;
      onCreated();
      onClose();
      setTitle('');
      setDesc('');
      setDepartment('hr');
      setFile(null);
      showToast({ type: 'success', message: 'Support ticket opened successfully!' });
    } catch (err) {
      console.error('[Tickets] Failed to open ticket:', err);
      setFileError(attaching
        ? 'The ticket was filed, but the attachment could not be sent. Press File Ticket again to retry the attachment.'
        : err instanceof Error ? err.message : 'Could not file the ticket. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="File Support Ticket">
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Department *" size="md">
          <Select required value={department} onChange={e => setDepartment(e.target.value as 'hr' | 'technical')} fieldSize="md" className="appearance-none">
            <option value="hr">Human Resources</option>
            <option value="technical">Technical Team</option>
          </Select>
        </FormField>

        <FormField label="Ticket Title / Topic *" size="md">
          <Input type="text" required value={title} onChange={e => setTitle(e.target.value)} fieldSize="md" placeholder="e.g. Salary discrepancy / System access issues" />
        </FormField>

        <FormField label="Describe the Problem *" size="md">
          <Textarea required rows={4} value={desc} onChange={e => setDesc(e.target.value)} fieldSize="md" className="resize-none" placeholder="Explain the situation in details so HR can assist you..." />
        </FormField>

        <FormField label="Attachment (optional)" size="md">
          {fileError && (
            <div className="p-2 text-caption bg-rose-50 text-rose-600 border border-rose-100 rounded-lg font-semibold flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />{fileError}
            </div>
          )}
          {file ? (
            <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600">
              <span className="flex items-center gap-1.5 truncate"><FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" /> {file.name}</span>
              <button type="button" onClick={() => setFile(null)} aria-label="Remove attachment" className="text-slate-500 hover:text-rose-600 shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-600 px-3 py-2.5 rounded-lg transition-colors transition-transform border border-dashed border-slate-300 active:scale-97"
            >
              <Paperclip className="h-3.5 w-3.5" /> Attach a screenshot or document
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={onFileChange} className="hidden" />
        </FormField>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="outline" size="md" disabled={busy} onClick={close}>Cancel</Button>
          <Button type="submit" disabled={busy} size="lg">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {busy ? 'Filing…' : 'File Ticket'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
