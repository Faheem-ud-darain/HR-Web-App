'use client';

import React from 'react';
import { Crown, Megaphone, Paperclip, X, FileText, Video, Smile, Loader2, Send } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { displayName, Team, Profile } from '@/lib/hrData';
import { EmojiPicker } from '@/components/ui/chat/chatHelpers';
import { isNativeMobileApp } from '@/lib/trackerSetup';
import type { TeamDocument } from '@/lib/hrData';

interface ChatComposerProps {
  oversight: boolean;
  activeTeam: Team | undefined;
  draftIsAnnouncement: boolean;
  sendError: string;
  pendingFile: File | null;
  setPendingFile: React.Dispatch<React.SetStateAction<File | null>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  mention: { query: string; start: number; } | null;
  mentionSuggestions: Profile[];
  pickMention: (profile: Profile) => void;
  currentUserRole: "employee" | "hr" | "admin" | "team_lead";
  docTag: { query: string; start: number; } | null;
  docTagSuggestions: TeamDocument[];
  pickDocTag: (doc: { title: string; }) => void;
  teamDocuments: TeamDocument[];
  handleFilePick: (file: File | undefined) => void;
  setDraft: React.Dispatch<React.SetStateAction<string>>;
  setDraftIsAnnouncement: React.Dispatch<React.SetStateAction<boolean>>;
  emojiWrapperRef: React.RefObject<HTMLDivElement | null>;
  setShowEmojiPicker: React.Dispatch<React.SetStateAction<boolean>>;
  showEmojiPicker: boolean;
  insertEmoji: (emoji: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  draft: string;
  handleDraftChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  setMention: React.Dispatch<React.SetStateAction<{ query: string; start: number; } | null>>;
  setDocTag: React.Dispatch<React.SetStateAction<{ query: string; start: number; } | null>>;
  handleSend: () => Promise<void>;
  sending: boolean;
}

export function ChatComposer({ oversight, activeTeam, draftIsAnnouncement, sendError, pendingFile, setPendingFile, fileInputRef, mention, mentionSuggestions, pickMention, currentUserRole, docTag, docTagSuggestions, pickDocTag, teamDocuments, handleFilePick, setDraft, setDraftIsAnnouncement, emojiWrapperRef, setShowEmojiPicker, showEmojiPicker, insertEmoji, textareaRef, draft, handleDraftChange, setMention, setDocTag, handleSend, sending }: ChatComposerProps) {
  return (
    <div className="border-t border-slate-200 px-2 md:px-3 pt-2 md:pt-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:pb-[calc(0.75rem+env(safe-area-inset-bottom))] shrink-0 relative bg-white">
      {oversight && (
        <p className="text-[9px] text-purple-600 font-bold mb-2 flex items-center gap-1"><Crown className="h-3 w-3" /> Posting as Admin — this message will be highlighted for everyone in {activeTeam?.name || 'this team'}.</p>
      )}
      {draftIsAnnouncement && (
        <p className="text-[9px] text-amber-700 font-bold mb-2 flex items-center gap-1"><Megaphone className="h-3 w-3" /> Sending as a pinned Announcement — everyone in {activeTeam?.name || 'this team'} will see it highlighted at the top.</p>
      )}
      {sendError && <p className="text-[10px] text-rose-600 font-bold mb-1.5 px-1">{sendError}</p>}
      {pendingFile && (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 mb-2 text-[10px] font-bold text-slate-600">
          <Paperclip className="h-3 w-3" /> {pendingFile.name}
          <button onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="ml-auto text-slate-400 hover:text-rose-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    
      {/* @mention suggestion dropdown */}
      {mention && mentionSuggestions.length > 0 && (
        <div className="absolute bottom-full left-3 mb-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-10">
          {mentionSuggestions.map(p => (
            <button
              key={p.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); pickMention(p); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-50 transition-colors"
            >
              <Avatar src={p.profilePicture} name={displayName(p, currentUserRole)} size={22} />
              <span className="text-xs font-bold text-slate-800 truncate">{displayName(p, currentUserRole)}</span>
              {p.role === 'admin' && <Crown className="h-3 w-3 text-purple-600 ml-auto shrink-0" />}
            </button>
          ))}
        </div>
      )}
    
      {/* "#" document-tag suggestion dropdown */}
      {docTag && docTagSuggestions.length > 0 && (
        <div className="absolute bottom-full left-3 mb-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-10">
          {docTagSuggestions.map(d => (
            <button
              key={d.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); pickDocTag(d); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-sky-50 transition-colors"
            >
              <FileText className="h-3.5 w-3.5 text-sky-600 shrink-0" />
              <span className="text-xs font-bold text-slate-800 truncate">{d.title}</span>
            </button>
          ))}
        </div>
      )}
      {docTag && docTagSuggestions.length === 0 && teamDocuments.length === 0 && (
        <div className="absolute bottom-full left-3 mb-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-10 px-3 py-2">
          <span className="text-[10px] text-slate-400 font-semibold">No documents in this team yet.</span>
        </div>
      )}
    
      <div className="flex items-center gap-1.5 md:gap-2">
        <label className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 cursor-pointer transition-colors shrink-0 flex items-center justify-center" title="Attach file">
          <Paperclip className="h-4 w-4" />
          <input ref={fileInputRef} type="file" className="hidden" onChange={e => handleFilePick(e.target.files?.[0])} />
        </label>
    
        <button
          type="button"
          onClick={() => {
            const meetLink = 'https://meet.google.com/new';
            const title = `🎥 Google Meet Video Room\nClick to join video call: ${meetLink}`;
            setDraft(prev => prev ? `${prev}\n${title}` : title);
          }}
          title="Create Google Meet Video Call"
          className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 flex items-center justify-center transition-colors shrink-0"
        >
          <Video className="h-4 w-4" />
        </button>
        
        {oversight && (
          <button
            type="button"
            onClick={() => setDraftIsAnnouncement(v => !v)}
            title="Send as Announcement"
            className={`h-8 w-8 md:h-9 md:w-9 rounded-full flex items-center justify-center transition-colors shrink-0 ${
              draftIsAnnouncement ? 'bg-amber-500 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'
            }`}
          >
            <Megaphone className="h-4 w-4" />
          </button>
        )}
    
        <div className="relative flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-3xl pl-1 pr-3">
          <div ref={emojiWrapperRef} className="shrink-0">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(v => !v)}
              title="Insert emoji"
              className={`p-2 rounded-full transition-colors flex items-center justify-center ${
                showEmojiPicker ? 'text-orange-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Smile className="h-4 w-4" />
            </button>
            {showEmojiPicker && (
              <div className="absolute bottom-full left-0 mb-2">
                <EmojiPicker onPick={insertEmoji} onClose={() => setShowEmojiPicker(false)} />
              </div>
            )}
          </div>
          
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={e => {
              if (mention && mentionSuggestions.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) {
                e.preventDefault();
                pickMention(mentionSuggestions[0]);
                return;
              }
              if (mention && e.key === 'Escape') {
                e.preventDefault();
                setMention(null);
                return;
              }
              if (docTag && docTagSuggestions.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) {
                e.preventDefault();
                pickDocTag(docTagSuggestions[0]);
                return;
              }
              if (docTag && e.key === 'Escape') {
                e.preventDefault();
                setDocTag(null);
                return;
              }
              // Same reasoning as TicketsView's reply box: on the native
              // mobile app the keyboard's Enter/Return key should only
              // ever insert a newline (there's no Shift key on a phone),
              // so gate the "Enter sends" shortcut to desktop web only.
              if (e.key === 'Enter' && !e.shiftKey && !isNativeMobileApp()) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={draftIsAnnouncement ? 'Announcement…' : 'Message… (@ to mention)'}
            rows={1}
            className="flex-1 bg-transparent py-2 md:py-2.5 px-1 text-[10px] md:text-[11px] outline-none font-medium resize-none max-h-24 min-h-8 md:min-h-9 w-full"
          />
        </div>
    
        <button
          onClick={handleSend}
          disabled={sending || (!draft.trim() && !pendingFile)}
          className={`h-8 w-8 md:h-9 md:w-9 rounded-full flex items-center justify-center disabled:opacity-50 text-white transition-colors transition-transform active:scale-95 shrink-0 ${
            draftIsAnnouncement ? 'bg-amber-500 hover:bg-amber-600' : 'bg-orange-600 hover:bg-orange-700'
          }`}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
