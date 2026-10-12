'use client';

import React from 'react';
import { Lock, AlertCircle, FileText, X, Paperclip, Send } from 'lucide-react';
import { isNativeMobileApp } from '@/lib/trackerSetup';
import { Ticket } from '@/lib/hrData';

interface TicketComposerProps {
  isClosed: boolean;
  selectedTicket: Ticket;
  isAdmin: boolean;
  handleSendReply: (e: React.FormEvent) => void;
  replyFileError: string;
  replyFile: File | null;
  setReplyFile: React.Dispatch<React.SetStateAction<File | null>>;
  replyFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleReplyFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  replyTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  replyMsg: string;
  handleReplyMsgChange: (value: string) => void;
  sendReply: () => Promise<void>;
  sendingReply: boolean;
}

export function TicketComposer({ isClosed, selectedTicket, isAdmin, handleSendReply, replyFileError, replyFile, setReplyFile, replyFileInputRef, handleReplyFileChange, replyTextareaRef, replyMsg, handleReplyMsgChange, sendReply, sendingReply }: TicketComposerProps) {
  return (
    <div className="px-3 md:px-4 pt-3 md:pt-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-slate-200 bg-white">
      {isClosed ? (
        <div className="text-xs text-slate-400 font-semibold italic text-center py-2 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center gap-1 flex-wrap">
          <Lock className="h-3.5 w-3.5 shrink-0" /> This support ticket is closed and read-only.
          {selectedTicket.replies.some(r => r.attachmentUrl) && (
            <span className="text-slate-400">Any attached files will be automatically deleted 15 days after closing.</span>
          )}
        </div>
      ) : isAdmin ? (
        <div className="text-xs text-slate-400 font-semibold italic text-center py-2 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center gap-1.5">
          <Lock className="h-3.5 w-3.5 shrink-0" /> Admins can only view logs and history. Replies are disabled.
        </div>
      ) : (
        <form onSubmit={handleSendReply} className="space-y-2">
          {replyFileError && (
            <div className="p-2 text-[10px] bg-rose-50 text-rose-600 border border-rose-100 rounded-lg font-semibold flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />{replyFileError}
            </div>
          )}
          {replyFile && (
            <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-semibold text-slate-600">
              <span className="flex items-center gap-1.5 truncate"><FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" /> {replyFile.name}</span>
              <button type="button" onClick={() => setReplyFile(null)} className="text-slate-400 hover:text-rose-600 shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-1.5 md:gap-2">
            <label
              title="Attach a file"
              className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            >
              <Paperclip className="h-4 w-4" />
              <input ref={replyFileInputRef} type="file" accept="image/*,application/pdf" onChange={handleReplyFileChange} className="hidden" />
            </label>
            
            <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-3xl pr-2 md:pr-3">
              <textarea
                ref={replyTextareaRef}
                value={replyMsg}
                onChange={e => handleReplyMsgChange(e.target.value)}
                onKeyDown={e => {
                  // On the native mobile app, the on-screen keyboard's
                  // Enter/Return key should always insert a line break —
                  // there's no Shift key on a phone to combine with, so
                  // treating Enter as "send" there means every attempt
                  // at a multi-line reply sends the message prematurely.
                  // Desktop web keeps Enter-to-send / Shift+Enter-for-
                  // newline, since a physical keyboard has both keys.
                  if (e.key === 'Enter' && !e.shiftKey && !isNativeMobileApp()) {
                    e.preventDefault();
                    sendReply();
                  }
                }}
                placeholder="Type your reply..."
                rows={1}
                className="flex-1 bg-transparent py-3 px-3 md:px-4 text-xs md:text-sm outline-none text-slate-900 resize-none max-h-28 min-h-[40px] w-full"
              />
            </div>
    
            <button
              type="submit"
              disabled={(!replyMsg.trim() && !replyFile) || sendingReply}
              className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold active:scale-97 transition-colors transition-transform flex items-center justify-center shadow-sm shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
