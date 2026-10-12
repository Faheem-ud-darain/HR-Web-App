'use client';

import React from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { formatTicketDate, isImageAttachment, formatBytes } from '@/components/ui/tickets/ticketHelpers';
import { FileText, Download } from 'lucide-react';
import { TypingIndicator } from '@/components/ui/TypingIndicator';
import { Ticket, Profile, TicketSeenState } from '@/lib/hrData';

interface TicketReplyLogProps {
  currentEmail: string;
  selectedTicket: Ticket;
  userProfile: Profile | null;
  profileFor: (name: string) => Profile | undefined;
  nameFor: (name: string) => string;
  role: "admin" | "hr" | "employee" | "team_lead";
  isPrivileged: boolean;
  ticketSeenState: TicketSeenState | null;
  setLightboxSrc: React.Dispatch<React.SetStateAction<string | null>>;
  setLightboxName: React.Dispatch<React.SetStateAction<string | undefined>>;
  typingNames: string[];
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}

export function TicketReplyLog({ currentEmail, selectedTicket, userProfile, profileFor, nameFor, role, isPrivileged, ticketSeenState, setLightboxSrc, setLightboxName, typingNames, chatEndRef }: TicketReplyLogProps) {
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
    
        // "Seen" only ever shows under the single most recent
        // HR reply, same one-badge-at-a-time convention as most
        // chat apps (not one per message) — and only to HR/Admin,
        // since they're the ones who actually want to know
        // whether the employee has caught up.
        const isLastReply = repIdx === selectedTicket.replies.length - 1;
        const showSeen =
          isLastReply &&
          isPrivileged &&
          rep.senderRole === 'hr' &&
          !!ticketSeenState?.employeeSeenAt &&
          new Date(ticketSeenState.employeeSeenAt).getTime() >= new Date(rep.timestamp).getTime();
    
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
                      onClick={() => { setLightboxSrc(rep.attachmentUrl!); setLightboxName(rep.attachmentName); }}
                      className={rep.message ? 'block mt-2' : 'block'}
                    >
                      <img src={rep.attachmentUrl} alt={rep.attachmentName || 'attachment'} className="rounded-lg max-h-56 object-cover" />
                    </button>
                  ) : (
                    <a
                      href={rep.attachmentUrl}
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
              {showSeen && (
                <span className={`block text-[9px] font-semibold mt-1 ${isSenderSelf ? 'text-right' : 'text-left'} text-slate-400`}>
                  Seen
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
