'use client';

import React, { useRef, useState } from 'react';
import { hrActions, isTechnicalSupportMember, type Profile, type Ticket } from '@/lib/hrData';
import { fileToStoredData } from '@/lib/imageCompressor';
import type { TicketRole } from './ticketHelpers';

interface ReplyArgs {
  selectedTicket: Ticket | null;
  role: TicketRole;
  currentEmail: string;
  userProfile: Profile | null;
  // Called after a reply is saved, so the list can refresh.
  onSent: () => void;
}

// The reply box under an open ticket: text, optional attachment, send, and the "is typing" marker the other
// side polls for.
export function useTicketReply({ selectedTicket, role, currentEmail, userProfile, onSent }: ReplyArgs) {
  const [replyMsg, setReplyMsg] = useState('');
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [replyFileError, setReplyFileError] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingTouchRef = useRef<number>(0);

  const handleReplyFilePick = (file: File | undefined) => {
    if (!file) return;
    setReplyFileError('');
    setReplyFile(file);
  };

  // Shared by the form's onSubmit and the textarea's Enter-to-send, so neither fakes a FormEvent.
  const sendReply = async () => {
    if ((!replyMsg.trim() && !replyFile) || !selectedTicket || sendingReply) return;
    setReplyFileError('');

    let senderName = currentEmail.split('@')[0];
    if (role === 'hr') senderName = 'HR Manager';
    else if (role === 'admin') senderName = 'System Admin';
    if (isTechnicalSupportMember(userProfile?.teams) || role === 'employee' || role === 'team_lead') {
      senderName = userProfile?.fullName || senderName;
    }

    setSendingReply(true);
    try {
      let attachmentFields: { attachmentName?: string; attachmentUrl?: string; attachmentSize?: number } = {};
      if (replyFile) {
        const { data, error } = await fileToStoredData(replyFile);
        if (error) { setReplyFileError(error); return; }
        attachmentFields = { attachmentName: replyFile.name, attachmentUrl: data, attachmentSize: replyFile.size };
      }

      await hrActions.addTicketReply(selectedTicket, {
        senderName,
        senderRole: role,
        senderEmail: currentEmail,
        message: replyMsg.trim(),
        ...attachmentFields,
      });

      onSent();
      setReplyMsg('');
      setReplyFile(null);
      lastTypingTouchRef.current = 0;
      hrActions.clearTypingState('ticket', selectedTicket.id, currentEmail).catch(() => {});
    } catch (err) {
      // fileToStoredData can throw (compressImageToWebP rejects rather than storing an unusable file).
      console.error('[Tickets] Failed to send reply:', err);
      setReplyFileError(err instanceof Error ? err.message : 'Failed to attach this file. Please try again.');
    } finally {
      setSendingReply(false);
    }
  };

  // Touches the typing marker at most once every 1.5s while there is text; clears it as soon as it is emptied.
  const handleReplyMsgChange = (value: string) => {
    setReplyMsg(value);
    if (!selectedTicket || !currentEmail) return;
    const ticketId = selectedTicket.id;
    if (value.trim()) {
      const now = Date.now();
      if (now - lastTypingTouchRef.current > 1500) {
        lastTypingTouchRef.current = now;
        hrActions.touchTypingState('ticket', ticketId, currentEmail, userProfile?.fullName || currentEmail).catch(() => {});
      }
    } else {
      lastTypingTouchRef.current = 0;
      hrActions.clearTypingState('ticket', ticketId, currentEmail).catch(() => {});
    }
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    sendReply();
  };

  return {
    replyMsg, replyFile, setReplyFile, replyFileError, sendingReply,
    replyFileInputRef, replyTextareaRef,
    handleReplyFilePick, handleReplyMsgChange, sendReply, handleSendReply,
  };
}
