'use client';

import React, { useId, useState } from 'react';
import { useAutoGrow } from '@/lib/useAutoGrow';
import { CrownIcon as Crown, MegaphoneIcon as Megaphone, FileTextIcon as FileText, VideoCameraIcon as Video, SmileyIcon as Smile } from '@phosphor-icons/react/dist/ssr';
import { Avatar } from '@/components/ui/Avatar';
import { displayName, Team, Profile } from '@/lib/hrData';
import { EmojiPicker } from '@/components/ui/chat/chatHelpers';
import { AttachButton, SendButton, PendingFileChip, enterSends, SuggestionList, ROUND_BTN, COMPOSER_BAR, COMPOSER_FIELD, COMPOSER_TEXT } from '@/components/ui/ComposerParts';
import type { TeamDocument } from '@/lib/hrData';
import { useChatComposer } from '@/components/ui/chat/useChatComposer';

interface ChatComposerProps {
  oversight: boolean;
  activeTeamId: string | null;
  activeTeam: Team | undefined;
  currentUserEmail: string;
  currentUserRole: 'employee' | 'hr' | 'admin' | 'team_lead';
  emailToProfile: Map<string, Profile>;
  mentionDropdownCandidates: Profile[];
  teamDocuments: TeamDocument[];
}

// The message box. It owns the draft (via useChatComposer), so typing re-renders only this box and not the whole
// thread above it. Mounted with `key={channel id}` so a half-typed message never follows you into another channel.
export function ChatComposer({ oversight, activeTeamId, activeTeam, currentUserEmail, currentUserRole, emailToProfile, mentionDropdownCandidates, teamDocuments }: ChatComposerProps) {
  const {
    draft, setDraft, pendingFile, setPendingFile, sending, sendError, mention, setMention, docTag, setDocTag,
    draftIsAnnouncement, setDraftIsAnnouncement, showEmojiPicker, setShowEmojiPicker,
    fileInputRef, textareaRef, emojiWrapperRef, mentionSuggestions, docTagSuggestions,
    handleFilePick, handleDraftChange, pickMention, pickDocTag, insertEmoji, handleSend,
  } = useChatComposer({ activeTeamId, activeTeam, currentUserEmail, currentUserRole, emailToProfile, mentionDropdownCandidates, teamDocuments });
  // Which suggestion Enter or Tab would pick; the arrow keys move it, and typing sends it back to the first.
  const listId = useId();
  const [activeIdx, setActiveIdx] = useState(0);
  const mentionOpen = !!mention && mentionSuggestions.length > 0;
  const docOpen = !mentionOpen && !!docTag && docTagSuggestions.length > 0;
  const suggestionCount = mentionOpen ? mentionSuggestions.length : docOpen ? docTagSuggestions.length : 0;
  const active = Math.min(activeIdx, Math.max(suggestionCount - 1, 0));
  useAutoGrow(textareaRef, draft, 192); // grows and shrinks with what is typed
  return (
    <div className={`${COMPOSER_BAR} shrink-0 relative`}>
      {oversight && (
        <p className="text-[11px] text-purple-600 font-bold mb-2 flex items-center gap-1"><Crown className="h-3 w-3" /> Posting as Admin — this message will be highlighted for everyone in {activeTeam?.name || 'this team'}.</p>
      )}
      {draftIsAnnouncement && (
        <p className="text-[11px] text-amber-700 font-bold mb-2 flex items-center gap-1"><Megaphone className="h-3 w-3" /> Sending as a pinned Announcement — everyone in {activeTeam?.name || 'this team'} will see it highlighted at the top.</p>
      )}
      {sendError && <p className="text-[11px] text-rose-600 font-bold mb-1.5 px-1">{sendError}</p>}
      {pendingFile && (
        <div className="mb-2">
          <PendingFileChip name={pendingFile.name} onRemove={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} />
        </div>
      )}
    
      {mentionOpen && (
        <SuggestionList id={listId} label="People to mention" items={mentionSuggestions} active={active} onPick={pickMention} widthClass="w-56" activeClass="bg-orange-50" hoverClass="hover:bg-orange-50">
          {p => (
            <>
              <Avatar src={p.profilePicture} name={displayName(p, currentUserRole)} size={22} />
              <span className="text-xs font-bold text-slate-800 truncate">{displayName(p, currentUserRole)}</span>
              {p.role === 'admin' && <Crown className="h-3 w-3 text-purple-600 ml-auto shrink-0" />}
            </>
          )}
        </SuggestionList>
      )}

      {docOpen && (
        <SuggestionList id={listId} label="Documents to tag" items={docTagSuggestions} active={active} onPick={pickDocTag} widthClass="w-64" activeClass="bg-sky-50" hoverClass="hover:bg-sky-50">
          {d => (
            <>
              <FileText className="h-3.5 w-3.5 text-sky-600 shrink-0" />
              <span className="text-xs font-bold text-slate-800 truncate">{d.title}</span>
            </>
          )}
        </SuggestionList>
      )}
      {docTag && docTagSuggestions.length === 0 && teamDocuments.length === 0 && (
        <div className="absolute bottom-full left-3 mb-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-10 px-3 py-2">
          <span className="text-[11px] text-slate-500 font-semibold">No documents in this team yet.</span>
        </div>
      )}
    
      <div className="flex items-center gap-1.5 md:gap-2">
        <AttachButton inputRef={fileInputRef} onPick={handleFilePick} title="Attach file" />
    
        <button
          type="button"
          onClick={() => {
            const meetLink = 'https://meet.google.com/new';
            const title = `🎥 Google Meet Video Room\nClick to join video call: ${meetLink}`;
            setDraft(prev => prev ? `${prev}\n${title}` : title);
          }}
          title="Create Google Meet Video Call" aria-label="Create Google Meet Video Call"
          className={`${ROUND_BTN} bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 transition-colors`}
        >
          <Video className="h-4 w-4" />
        </button>
        
        {oversight && (
          <button
            type="button"
            onClick={() => setDraftIsAnnouncement(v => !v)}
            title="Send as Announcement" aria-label="Send as Announcement"
            className={`${ROUND_BTN} transition-colors ${
              draftIsAnnouncement ? 'bg-amber-500 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'
            }`}
          >
            <Megaphone className="h-4 w-4" />
          </button>
        )}
    
        <div className={`${COMPOSER_FIELD} pl-1 pr-3`}>
          <div ref={emojiWrapperRef} className="shrink-0">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(v => !v)}
              title="Insert emoji" aria-label="Insert emoji"
              className={`p-2 rounded-full transition-colors flex items-center justify-center ${
                showEmojiPicker ? 'text-orange-600' : 'text-slate-500 hover:text-slate-600'
              }`}
            >
              <Smile className="h-4 w-4" />
            </button>
            {showEmojiPicker && (
              <div className="absolute bottom-full left-3 mb-2">
                <EmojiPicker onPick={insertEmoji} onClose={() => setShowEmojiPicker(false)} />
              </div>
            )}
          </div>
          
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => { setActiveIdx(0); handleDraftChange(e); }}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestionCount > 0}
            aria-controls={suggestionCount > 0 ? listId : undefined}
            aria-activedescendant={suggestionCount > 0 ? `${listId}-${active}` : undefined}
            onKeyDown={e => {
              if (suggestionCount > 0) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveIdx((active + (e.key === 'ArrowDown' ? 1 : suggestionCount - 1)) % suggestionCount);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  if (mentionOpen) pickMention(mentionSuggestions[active]);
                  else pickDocTag(docTagSuggestions[active]);
                  return;
                }
              }
              if (e.key === 'Escape' && (mention || docTag)) {
                e.preventDefault();
                setMention(null);
                setDocTag(null);
                return;
              }
              if (enterSends(e)) {
                e.preventDefault();
                handleSend();
              }
            }}
            aria-label={draftIsAnnouncement ? 'Announcement' : 'Message'}
            placeholder={draftIsAnnouncement ? 'Announcement…' : 'Message… (@ to mention)'}
            rows={1}
            className={`${COMPOSER_TEXT} px-1 max-h-48`}
          />
        </div>
    
        <SendButton
          onClick={handleSend}
          disabled={sending || (!draft.trim() && !pendingFile)}
          busy={sending}
          className={draftIsAnnouncement ? 'bg-amber-500 hover:bg-amber-600' : 'bg-orange-600 hover:bg-orange-700'}
        />
      </div>
    </div>
  );
}
