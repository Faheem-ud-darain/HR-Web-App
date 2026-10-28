'use client';

import React from 'react';
import { LockIcon as Lock, WarningCircleIcon as AlertCircle } from '@phosphor-icons/react/dist/ssr';
import { AttachButton, SendButton, PendingFileChip, enterSends, COMPOSER_BAR, COMPOSER_FIELD, COMPOSER_TEXT } from '@/components/ui/ComposerParts';
import type { Profile, Ticket } from '@/lib/hrData';
import { useTicketReply } from '@/components/ui/tickets/useTicketReply';
import type { TicketRole } from '@/components/ui/tickets/ticketHelpers';
import { getSessionRole } from '@/lib/session';
import { useAutoGrow } from '@/lib/useAutoGrow';
import { DraftWithDel } from '@/components/assistant/DraftWithDel';

interface TicketComposerProps {
  isClosed: boolean;
  selectedTicket: Ticket;
  isAdmin: boolean;
  role: TicketRole;
  currentEmail: string;
  userProfile: Profile | null;
  // Called after a reply is saved, so the list can refresh.
  onSent: () => void;
}

// The reply box. It owns the draft (via useTicketReply), so typing re-renders only this box and not the thread
// above it. Mounted with `key={ticket id}` so a half-typed reply never follows you into another ticket.
export function TicketComposer({ isClosed, selectedTicket, isAdmin, role, currentEmail, userProfile, onSent }: TicketComposerProps) {
  const {
    replyMsg, replyFile, setReplyFile, replyFileError, sendingReply, replyFileInputRef, replyTextareaRef,
    handleReplyFilePick, handleReplyMsgChange, sendReply, handleSendReply,
  } = useTicketReply({ selectedTicket, role, currentEmail, userProfile, onSent });
  useAutoGrow(replyTextareaRef, replyMsg, 260); // grows and shrinks with what is typed
  return (
    <div className={COMPOSER_BAR}>
      {isClosed ? (
        <div className="text-xs text-slate-500 font-semibold italic text-center py-2 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center gap-1 flex-wrap">
          <Lock className="h-3.5 w-3.5 shrink-0" /> {role === 'employee' || role === 'team_lead' ? 'This ticket is closed. If you still need help, file a new ticket.' : 'This ticket is closed and read-only.'}
          {selectedTicket.replies.some(r => r.attachmentUrl) && (
            <span className="text-slate-500">Any attached files will be automatically deleted 15 days after closing.</span>
          )}
        </div>
      ) : isAdmin ? (
        <div className="text-xs text-slate-500 font-semibold italic text-center py-2 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center gap-1.5">
          <Lock className="h-3.5 w-3.5 shrink-0" /> Admins can read tickets but not reply. HR and Technical Support answer them.
        </div>
      ) : (
        <form onSubmit={handleSendReply} className="space-y-2">
          {replyFileError && (
            <div className="p-2 text-[11px] bg-rose-50 text-rose-600 border border-rose-100 rounded-lg font-semibold flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />{replyFileError}
            </div>
          )}
          {replyFile && <PendingFileChip name={replyFile.name} onRemove={() => setReplyFile(null)} />}
          {getSessionRole() === 'hr' && <DraftWithDel
            ticket={selectedTicket}
            onDraft={text => {
              handleReplyMsgChange(text);
              // The box grows to fit the draft by itself; just put the cursor in it.
              requestAnimationFrame(() => replyTextareaRef.current?.focus());
            }}
          />}
          <div className="flex items-center gap-1.5 md:gap-2">
            <AttachButton inputRef={replyFileInputRef} accept="image/*,application/pdf" onPick={handleReplyFilePick} />
            <div className={`${COMPOSER_FIELD} pr-2 md:pr-3`}>
              <textarea
                ref={replyTextareaRef}
                value={replyMsg}
                onChange={e => handleReplyMsgChange(e.target.value)}
                onKeyDown={e => {
                  if (enterSends(e)) {
                    e.preventDefault();
                    sendReply();
                  }
                }}
                aria-label="Reply"
                placeholder="Type your reply..."
                rows={1}
                className={`${COMPOSER_TEXT} max-h-64`}
              />
            </div>
    
            <SendButton disabled={(!replyMsg.trim() && !replyFile) || sendingReply} />
          </div>
        </form>
      )}
    </div>
  );
}
