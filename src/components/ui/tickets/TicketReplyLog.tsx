'use client';

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { MessageBubble, MessageRow, type BubbleTone } from '@/components/ui/chat/MessageBubble';
import { isOwnTicketReply, isTicketAuthor } from '@/lib/core/messageOwnership';
import { formatTicketDate } from '@/components/ui/tickets/ticketHelpers';
import { MessageAttachment } from '@/components/ui/MessageAttachment';
import { TypingIndicator } from '@/components/ui/TypingIndicator';
import { Ticket, Profile, TicketSeenState } from '@/lib/hrData';
import { receiptReplyIndex, ownerHasSeenMessage } from '@/lib/core/ticketReceipts';

interface TicketReplyLogProps {
  currentEmail: string;
  selectedTicket: Ticket;
  userProfile: Profile | null;
  profileFor: (name: string) => Profile | undefined;
  nameFor: (name: string) => string;
  role: "admin" | "hr" | "employee" | "team_lead";
  isPrivileged: boolean;
  ticketSeenState: TicketSeenState | null | undefined;
  onOpenImage: (src: string, name?: string) => void;
  typingNames: string[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export function TicketReplyLog({ currentEmail, selectedTicket, userProfile, profileFor, nameFor, role, ticketSeenState, onOpenImage, typingNames, scrollRef }: TicketReplyLogProps) {
  const viewer = { email: currentEmail, role, fullName: userProfile?.fullName };
  const viewerIsOwner = !!currentEmail && currentEmail.toLowerCase() === selectedTicket.employeeEmail.toLowerCase();
  // The one message that carries the "Seen / Not seen yet" receipt (-1 = none) — see core/ticketReceipts.
  const lastCounterpartIdx = receiptReplyIndex(selectedTicket);
  const meta = (name: string, when: string) => (
    <div className="mb-0.5 flex items-center gap-1.5 text-caption"><span className="font-bold text-slate-600">{name}</span><span className="font-semibold text-slate-500">{when}</span></div>
  );

  return (
    <div ref={scrollRef} role="log" aria-live="polite" aria-relevant="additions" aria-label="Ticket replies" className="flex-1 min-h-0 p-5 space-y-4 overflow-y-auto bg-slate-50/30">
      {/* The ticket's own description is the first message, from its author. */}
      {(() => {
        const own = isTicketAuthor(selectedTicket, viewer);
        return (
          <MessageRow own={own} name={selectedTicket.employeeName} picture={profileFor(selectedTicket.employeeName)?.profilePicture}>
            {meta(`${nameFor(selectedTicket.employeeName)} (Author)`, formatTicketDate(selectedTicket.createdAt))}
            <MessageBubble own={own} tone={own ? 'own' : 'other'}><p className="whitespace-pre-wrap break-words">{selectedTicket.description}</p></MessageBubble>
          </MessageRow>
        );
      })()}

      {selectedTicket.replies.map((rep, repIdx) => {
        if (rep.event) {
          const who = rep.senderRole === 'hr' ? 'HR' : rep.senderRole === 'admin' ? 'Admin' : 'employee';
          return (
            <div key={rep.id} className="flex justify-center py-1">
              <Badge size="sm" className="text-center">Ticket {rep.event} by {nameFor(rep.senderName)} ({who}) · {formatTicketDate(rep.timestamp)}</Badge>
            </div>
          );
        }
        const own = isOwnTicketReply(rep, viewer);
        // Read receipt. It tells HR and Admin (not Technical Support teammates, who are ordinary employees) whether the TICKET OWNER
        // has caught up, so it shows only to HR/Admin when they are not the owner, under the single most recent message that
        // someone OTHER than the owner sent (a trailing close/reopen event is skipped), and always says "Seen" or "Not seen yet".
        // `undefined` seen state = not loaded yet; "Not seen yet" then would be a false negative.
        const showReceipt = (role === 'hr' || role === 'admin') && !viewerIsOwner && repIdx === lastCounterpartIdx && ticketSeenState !== undefined;
        const ownerHasSeen = ownerHasSeenMessage(ticketSeenState?.employeeSeenAt, rep.timestamp);
        // Admin reading an HR reply sees it highlighted, so the staff answer stands out.
        const tone: BubbleTone = own ? 'own' : role === 'admin' && rep.senderRole === 'hr' ? 'hr-reply' : 'other';
        return (
          <MessageRow key={rep.id} own={own} name={rep.senderName} picture={profileFor(rep.senderName)?.profilePicture}>
            {meta(`${nameFor(rep.senderName)} (${rep.senderRole.toUpperCase()})${tone === 'hr-reply' ? ' ★' : ''}`, formatTicketDate(rep.timestamp))}
            <MessageBubble own={own} tone={tone}>
              {rep.message && <p className="whitespace-pre-wrap break-words">{rep.message}</p>}
              {rep.attachmentUrl && (
                <MessageAttachment url={rep.attachmentUrl} name={rep.attachmentName} size={rep.attachmentSize} spaced={!!rep.message} linkClass={own ? 'text-white/90' : 'text-amber-700'} onOpenImage={onOpenImage} download plainImage />
              )}
            </MessageBubble>
            {showReceipt && (
              <span className={`mt-1 block text-caption font-semibold ${ownerHasSeen ? 'text-emerald-600' : 'text-slate-500'}`}>
                {ownerHasSeen ? `Seen by ${nameFor(selectedTicket.employeeName)} · ${formatTicketDate(ticketSeenState!.employeeSeenAt)}` : `Not seen yet by ${nameFor(selectedTicket.employeeName)}`}
              </span>
            )}
          </MessageRow>
        );
      })}
      <TypingIndicator names={typingNames} />
    </div>
  );
}
