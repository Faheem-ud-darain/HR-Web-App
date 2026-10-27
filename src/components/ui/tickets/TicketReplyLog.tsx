'use client';

import React from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { formatTicketDate, isImageAttachment, formatBytes } from '@/components/ui/tickets/ticketHelpers';
import { FileText, Download } from 'lucide-react';
import { TypingIndicator } from '@/components/ui/TypingIndicator';
import { Ticket, Profile, TicketSeenState } from '@/lib/hrData';
import { receiptReplyIndex, ownerHasSeenMessage } from '@/lib/core/ticketReceipts';
import { safeHref } from '@/lib/sanitize';

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
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}

export function TicketReplyLog({ currentEmail, selectedTicket, userProfile, profileFor, nameFor, role, ticketSeenState, onOpenImage, typingNames, chatEndRef }: TicketReplyLogProps) {
  const viewerIsOwner = !!currentEmail && currentEmail.toLowerCase() === selectedTicket.employeeEmail.toLowerCase();
  // The one message that carries the "Seen / Not seen yet" receipt (-1 = none) — see core/ticketReceipts.
  const lastCounterpartIdx = receiptReplyIndex(selectedTicket);

  return (
    <div className="flex-1 min-h-0 p-5 space-y-4 overflow-y-auto bg-slate-50/30">
      {/* Employee Description */}
      {(() => {
        const isAuthorSelf = Boolean(
          (currentEmail && selectedTicket.employeeEmail && selectedTicket.employeeEmail.toLowerCase() === currentEmail.toLowerCase()) ||
          (userProfile?.fullName && selectedTicket.employeeName && selectedTicket.employeeName.trim().toLowerCase() === userProfile.fullName.trim().toLowerCase()) ||
          (userProfile?.email && selectedTicket.employeeEmail && selectedTicket.employeeEmail.toLowerCase() === userProfile.email.toLowerCase())
        );
        return (
          <div className={`flex items-start gap-2.5 max-w-[85%] ${isAuthorSelf ? 'ml-auto flex-row-reverse' : ''}`}>
            <Avatar src={profileFor(selectedTicket.employeeName)?.profilePicture} name={selectedTicket.employeeName} size={28} className="flex-shrink-0" />
            <div className={`rounded-2xl p-3 shadow-sm text-xs ${
              isAuthorSelf 
                ? 'bg-orange-600 text-white rounded-tr-none' 
                : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
            }`}>
              <p className={`font-bold text-[10px] mb-0.5 ${isAuthorSelf ? 'text-orange-200' : 'text-slate-500'}`}>
                {nameFor(selectedTicket.employeeName)} (Author)
              </p>
              <p className="font-medium leading-relaxed whitespace-pre-wrap break-words">{selectedTicket.description}</p>
              <span className={`block text-[9px] mt-1 text-right ${isAuthorSelf ? 'text-orange-200' : 'text-slate-400'}`}>
                {formatTicketDate(selectedTicket.createdAt)}
              </span>
            </div>
          </div>
        );
      })()}
    
      {/* Replies list */}
      {selectedTicket.replies.map((rep, repIdx) => {
        if (rep.event) {
          const who = rep.senderRole === 'hr' ? 'HR' : rep.senderRole === 'admin' ? 'Admin' : 'employee';
          return (
            <div key={rep.id} className="flex justify-center py-1">
              <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 rounded-full px-3 py-1 text-center">
                Ticket {rep.event} by {nameFor(rep.senderName)} ({who}) · {formatTicketDate(rep.timestamp)}
              </span>
            </div>
          );
        }
        let isSenderSelf = false;
    
        // 1. Direct email match if available
        if (rep.senderEmail && currentEmail && rep.senderEmail.toLowerCase() === currentEmail.toLowerCase()) {
          isSenderSelf = true;
        }
        // 2. HR role viewing an HR sender reply
        else if (role === 'hr' && rep.senderRole === 'hr') {
          isSenderSelf = true;
        }
        // 3. Admin role viewing an Admin sender reply
        else if (role === 'admin' && rep.senderRole === 'admin') {
          isSenderSelf = true;
        }
        // 4. Name matching for employees / tech team / profile matches
        else if (userProfile?.fullName && rep.senderName) {
          const normSender = rep.senderName.trim().toLowerCase();
          const normProfile = userProfile.fullName.trim().toLowerCase();
          isSenderSelf = normSender === normProfile || normSender.startsWith(normProfile) || normProfile.startsWith(normSender);
        }
        // 5. Email prefix matching fallback
        else if (currentEmail && rep.senderName && rep.senderName.trim().toLowerCase().includes(currentEmail.split('@')[0].toLowerCase())) {
          isSenderSelf = true;
        }
    
        // Read receipt. It tells HR and Admin (the two superior profiles —
        // Technical Support teammates are ordinary employees and don't get
        // one) whether the TICKET OWNER has caught up, so:
        //  - it is shown only to HR/Admin when they are not the owner
        //    themselves (the owner never sees a receipt about their own
        //    reading, and HR/Admin opening a ticket never marks the owner as
        //    having seen it — only the owner's own view writes that marker,
        //    see TicketsView);
        //  - it sits under the single most recent message that someone OTHER
        //    than the owner sent (a trailing close/reopen event is skipped);
        //  - it always says one thing or the other — "Seen" with the time, or
        //    "Not seen yet" — rather than staying silent until it's true.
        const isLastCounterpartMessage = repIdx === lastCounterpartIdx;
        // `undefined` = the seen state hasn't loaded yet; showing "Not seen yet" then would be a false negative.
        const showReceipt = (role === 'hr' || role === 'admin') && !viewerIsOwner && isLastCounterpartMessage && ticketSeenState !== undefined;
        const ownerHasSeen = ownerHasSeenMessage(ticketSeenState?.employeeSeenAt, rep.timestamp);
    
        const isAdminViewer = role === 'admin';
        const isHrSender = rep.senderRole === 'hr';
    
        return (
          <div 
            key={rep.id} 
            className={`flex items-start gap-2.5 max-w-[85%] ${
              isSenderSelf ? 'ml-auto flex-row-reverse' : ''
            }`}
          >
            <Avatar src={profileFor(rep.senderName)?.profilePicture} name={rep.senderName} size={28} className="flex-shrink-0" />
            {/* Column wrapper so "Seen" can sit below/outside the
                bubble instead of being one more line inside its
                padding+background — same idea as WhatsApp/iMessage
                read receipts, which render underneath the bubble,
                not inside it. */}
            <div className="flex flex-col min-w-0">
              <div className={`rounded-2xl p-3 shadow-sm text-xs ${
                isSenderSelf
                  ? 'bg-orange-600 text-white rounded-tr-none'
                  : isAdminViewer && isHrSender
                    ? 'bg-orange-50/80 border-2 border-orange-300/80 text-slate-800 rounded-tl-none shadow-orange-100/50'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
              }`}>
                <p className={`font-bold text-[10px] mb-0.5 ${
                  isSenderSelf
                    ? 'text-orange-200'
                    : isAdminViewer && isHrSender
                      ? 'text-orange-800'
                      : 'text-slate-600'
                }`}>
                  {nameFor(rep.senderName)} ({rep.senderRole.toUpperCase()}) {isAdminViewer && isHrSender && '★'}
                </p>
                {rep.message && <p className="font-medium leading-relaxed whitespace-pre-wrap break-words">{rep.message}</p>}
                {rep.attachmentUrl && (
                  isImageAttachment(rep.attachmentName) ? (
                    // Opens in the in-app lightbox instead of
                    // <a target="_blank"> — that used to hand the
                    // base64 data: URL off to an external browser
                    // intent, which on Android/Capacitor either
                    // fails silently or opens a blank tab, since
                    // there's no real document to navigate to.
                    <button
                      type="button"
                      onClick={() => onOpenImage(rep.attachmentUrl!, rep.attachmentName)}
                      className={rep.message ? 'block mt-2' : 'block'}
                    >
                      <img src={rep.attachmentUrl} alt={rep.attachmentName || 'attachment'} className="rounded-lg max-h-56 object-cover" />
                    </button>
                  ) : (
                    <a
                      href={safeHref(rep.attachmentUrl)}
                      download={rep.attachmentName}
                      className={`flex items-center gap-1.5 text-[11px] font-bold underline ${rep.message ? 'mt-2' : ''} ${isSenderSelf ? 'text-orange-100' : 'text-amber-700'}`}
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" /> {rep.attachmentName || 'Attachment'}
                      {rep.attachmentSize !== undefined && <span className="font-semibold opacity-80">({formatBytes(rep.attachmentSize)})</span>}
                      <Download className="h-3 w-3 shrink-0" />
                    </a>
                  )
                )}
                <span className={`block text-[9px] mt-1 text-right ${
                  isSenderSelf
                    ? 'text-orange-200'
                    : isAdminViewer && isHrSender
                      ? 'text-orange-700/80'
                      : 'text-slate-400'
                }`}>
                  {formatTicketDate(rep.timestamp)}
                </span>
              </div>
              {showReceipt && (
                <span className={`block text-[9px] font-semibold mt-1 ${isSenderSelf ? 'text-right' : 'text-left'} ${ownerHasSeen ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {ownerHasSeen
                    ? `Seen by ${nameFor(selectedTicket.employeeName)} · ${formatTicketDate(ticketSeenState!.employeeSeenAt)}`
                    : `Not seen yet by ${nameFor(selectedTicket.employeeName)}`}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <TypingIndicator names={typingNames} />
      <div ref={chatEndRef} />
    </div>
  );
}
