'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { hrActions, type Profile, type Ticket } from '@/lib/hrData';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import type { TicketRole } from './ticketHelpers';

interface ForwardTicketModalProps {
  ticket: Ticket;
  role: TicketRole;
  currentEmail: string;
  userProfile: Profile | null;
  onClose: () => void;
}

// "Forward to HR & Admin": HR/Admin's private line to each other, with an optional note. Works for closed
// tickets too, and re-forwarding is unrestricted (each forward is a new hr_messages row). A ticket has no
// attachment of its own, so nothing is copied across. Same shape as TeamChatView's forward modal
// (hrActions.forwardToHrAdminLine is the one mechanism behind all three).
// Mounted only while a ticket is being forwarded, so the note and error start empty every time.
export function ForwardTicketModal({ ticket, role, currentEmail, userProfile, onClose }: ForwardTicketModalProps) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const forwarderName = userProfile?.fullName || (role === 'hr' ? 'HR Manager' : 'System Admin');
      await hrActions.forwardToHrAdminLine(currentEmail, forwarderName, role === 'admin' ? 'admin' : 'hr', 'ticket', ticket.title, ticket.id, note);
      onClose();
    } catch (err) {
      console.error('Forward ticket failed:', err);
      setError('Could not forward that ticket. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !busy && onClose()} title="Forward to HR & Admin">
      <div className="space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Ticket</p>
          <p className="text-xs font-bold text-slate-800 break-words">{ticket.title}</p>
          <p className="text-xs text-slate-500 mt-1 line-clamp-3 break-words">{ticket.description}</p>
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
