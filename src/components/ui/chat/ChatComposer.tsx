'use client';

import React, { useId, useState } from 'react';
import { useAutoGrow } from '@/lib/useAutoGrow';
import { CrownIcon as Crown, MegaphoneIcon as Megaphone, FileTextIcon as FileText, VideoCameraIcon as Video, SmileyIcon as Smile, PlusIcon as Plus, PaperclipIcon as Paperclip } from '@/components/ui/icons';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';
import { displayName, Team, Profile } from '@/lib/hrData';
import { EmojiPicker } from '@/components/ui/chat/chatHelpers';
import { AttachButton, SendButton, PendingFileChip, enterSends, SuggestionList, COMPOSER_BAR, COMPOSER_FIELD, COMPOSER_TEXT } from '@/components/ui/ComposerParts';
import type { TeamDocument } from '@/lib/hrData';
import { useChatComposer } from '@/components/ui/chat/useChatComposer';
import { DismissibleArea } from '@/components/ui/DismissibleArea';

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
  // On phones the attach, Meet and announcement buttons fold into one "+" menu so the text box keeps its width.
  const [menuOpen, setMenuOpen] = useState(false);
  const addMeetLink = () => {
    const title = '🎥 Google Meet Video Room\nClick to join video call: https://meet.google.com/new';
    setDraft(prev => prev ? `${prev}\n${title}` : title);
  };
  useAutoGrow(textareaRef, draft, 192); // grows and shrinks with what is typed
  return (
    <div className={`${COMPOSER_BAR} shrink-0 relative`}>
      {oversight && (
        <p className="text-caption text-purple-600 font-bold mb-2 flex items-center gap-1"><Crown className="h-3.5 w-3.5 shrink-0" /> Posting as Admin — highlighted for everyone in {activeTeam?.name || 'this team'}.</p>
      )}
      {draftIsAnnouncement && (
        <p className="text-caption text-amber-700 font-bold mb-2 flex items-center gap-1"><Megaphone className="h-3.5 w-3.5 shrink-0" /> Pinned announcement — shown at the top for everyone in {activeTeam?.name || 'this team'}.</p>
      )}
      {sendError && <p className="text-caption text-rose-600 font-bold mb-1.5 px-1">{sendError}</p>}
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
              {p.role === 'admin' && <Crown className="h-3.5 w-3.5 text-purple-600 ml-auto shrink-0" />}
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
          <span className="text-caption text-slate-500 font-semibold">No documents in this team yet.</span>
        </div>
      )}
    
      <div className="flex items-center gap-1.5 md:gap-2">
        <AttachButton inputRef={fileInputRef} onPick={handleFilePick} title="Attach file" className="max-md:hidden" />

        <IconButton label="Create Google Meet Video Call" size="composer" tone="success" className="max-md:hidden" onClick={addMeetLink}><Video className="h-4 w-4" /></IconButton>

        {oversight && (
          <IconButton label="Send as Announcement" size="composer" tone={draftIsAnnouncement ? 'warning' : 'soft'} className="max-md:hidden" aria-pressed={draftIsAnnouncement} onClick={() => setDraftIsAnnouncement(v => !v)}><Megaphone className="h-4 w-4" /></IconButton>
        )}

        <DismissibleArea open={menuOpen} onClose={() => setMenuOpen(false)} className="relative md:hidden">
          <IconButton label="More actions" size="composer" tone={draftIsAnnouncement ? 'warning' : 'soft'} aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
            <Plus className={`h-5 w-5 transition-transform ${menuOpen ? 'rotate-45' : ''}`} />
          </IconButton>
          {menuOpen && (
            <div role="menu" className="absolute bottom-full left-0 mb-2 w-60 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1.5 popover-enter">
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); fileInputRef.current?.click(); }} className="w-full flex items-center gap-3 px-4 min-h-11 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Paperclip className="h-5 w-5 text-slate-500" /> Attach a file
              </button>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); addMeetLink(); }} className="w-full flex items-center gap-3 px-4 min-h-11 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Video className="h-5 w-5 text-emerald-600" /> Add a Google Meet link
              </button>
              {oversight && (
                <button type="button" role="menuitemcheckbox" aria-checked={draftIsAnnouncement} onClick={() => { setMenuOpen(false); setDraftIsAnnouncement(v => !v); }} className="w-full flex items-center gap-3 px-4 min-h-11 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Megaphone className="h-5 w-5 text-amber-600" /> {draftIsAnnouncement ? 'Sending as announcement' : 'Send as announcement'}
                </button>
              )}
            </div>
          )}
        </DismissibleArea>

        <div className={`${COMPOSER_FIELD} pl-1 pr-3`}>
          <div ref={emojiWrapperRef} className="shrink-0">
            <IconButton label="Insert emoji" size="sm" className={showEmojiPicker ? 'text-orange-600' : ''} onClick={() => setShowEmojiPicker(v => !v)}><Smile className="h-4 w-4" /></IconButton>
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
          tone={draftIsAnnouncement ? 'warning' : 'primary'}
        />
      </div>
    </div>
  );
}
