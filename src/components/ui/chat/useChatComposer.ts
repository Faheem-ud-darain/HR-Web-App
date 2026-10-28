'use client';

import React, { useEffect, useRef, useState } from 'react';
import { buildNotificationLink, displayName, hrActions, HR_ADMIN_LINE_TEAM_ID, type Profile, type Team, type TeamDocument } from '@/lib/hrData';
import { MAX_ATTACHMENT_BYTES, normEmail } from './chatHelpers';

interface ComposerArgs {
  activeTeamId: string | null;
  activeTeam: Team | undefined;
  currentUserEmail: string;
  currentUserRole: 'admin' | 'hr' | 'employee' | 'team_lead';
  emailToProfile: Map<string, Profile>;
  // People the @mention dropdown may offer (everyone in the channel except the viewer).
  mentionDropdownCandidates: Profile[];
  teamDocuments: TeamDocument[];
}

// Everything behind the message box: the draft, a pending attachment, "@name" and "#document" autocomplete, the
// emoji picker, the typing marker other people poll for, and sending (with mention and HR & Admin Line alerts).
export function useChatComposer({ activeTeamId, activeTeam, currentUserEmail, currentUserRole, emailToProfile, mentionDropdownCandidates, teamDocuments }: ComposerArgs) {
  const [draft, setDraft] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  // `mention` is null while the dropdown is closed, otherwise the text typed after "@" and where that "@" sits in
  // the draft, so a picked suggestion replaces exactly that span.
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  // Profiles picked this compose session, so on send we know exactly who to notify (more reliable than re-parsing).
  const [mentionedProfiles, setMentionedProfiles] = useState<Map<string, Profile>>(new Map());
  // "#" document tag: the same idea as a mention, for referencing a Team Document.
  const [docTag, setDocTag] = useState<{ query: string; start: number } | null>(null);
  const [draftIsAnnouncement, setDraftIsAnnouncement] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const lastTypingTouchRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiWrapperRef = useRef<HTMLDivElement>(null);

  // Closes the emoji picker on an outside click. Lives here (wrapping both the toggle and the panel) so a click on
  // the toggle button is not treated as "outside".
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleOutside = (e: MouseEvent) => {
      if (emojiWrapperRef.current && !emojiWrapperRef.current.contains(e.target as Node)) setShowEmojiPicker(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showEmojiPicker]);

  const handleFilePick = (file: File | undefined) => {
    setSendError('');
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setSendError('File is too large — 100MB max.');
      return;
    }
    setPendingFile(file);
  };

  const mentionSuggestions = mention
    ? mentionDropdownCandidates.filter(p => displayName(p, currentUserRole).toLowerCase().startsWith(mention.query.toLowerCase())).slice(0, 6)
    : [];
  // Documents in this team whose title contains what is typed after "#".
  const docTagSuggestions = docTag ? teamDocuments.filter(d => d.title.toLowerCase().includes(docTag.query.toLowerCase())).slice(0, 6) : [];

  const handleDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart ?? value.length;
    setDraft(value);

    // Touch the typing marker at most once every 1.5s (it is a KV write) while there is text; clear it at once when
    // the box is emptied rather than waiting for it to go stale.
    if (activeTeamId && currentUserEmail) {
      if (value.trim()) {
        const now = Date.now();
        if (now - lastTypingTouchRef.current > 1500) {
          lastTypingTouchRef.current = now;
          hrActions.touchTypingState('chat', activeTeamId, currentUserEmail, emailToProfile.get(normEmail(currentUserEmail))?.fullName || currentUserEmail).catch(() => {});
        }
      } else {
        lastTypingTouchRef.current = 0;
        hrActions.clearTypingState('chat', activeTeamId, currentUserEmail).catch(() => {});
      }
    }

    const upToCursor = value.slice(0, cursor);
    const atIndex = upToCursor.lastIndexOf('@');
    const hashIndex = upToCursor.lastIndexOf('#');
    // Whichever trigger sits closer to the cursor wins, so switching from a mention to a tag leaves no stale dropdown.
    const triggerIndex = Math.max(atIndex, hashIndex);
    if (triggerIndex === -1) { setMention(null); setDocTag(null); return; }
    const between = upToCursor.slice(triggerIndex + 1, cursor);
    // Whitespace after the trigger means a finished word, not an in-progress mention/tag.
    if (/\s/.test(between)) { setMention(null); setDocTag(null); return; }
    if (triggerIndex === atIndex) {
      setMention({ query: between, start: atIndex });
      setDocTag(null);
    } else {
      setDocTag({ query: between, start: hashIndex });
      setMention(null);
    }
  };

  // Put the cursor right after inserted text so the person can keep typing without clicking back in.
  const refocusAfter = (position: number) => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(position, position);
    });
  };

  // Replace the "@query" / "#query" span (from `start` to the cursor) with `inserted`.
  const replaceTrigger = (start: number, inserted: string) => {
    const cursor = textareaRef.current?.selectionStart ?? draft.length;
    const before = draft.slice(0, start);
    setDraft(`${before}${inserted}${draft.slice(cursor)}`);
    refocusAfter(before.length + inserted.length);
  };

  const pickMention = (profile: Profile) => {
    if (!mention) return;
    replaceTrigger(mention.start, `@${displayName(profile, currentUserRole)} `);
    setMentionedProfiles(prev => new Map(prev).set(profile.email.toLowerCase(), profile));
    setMention(null);
  };

  const pickDocTag = (doc: { title: string }) => {
    if (!docTag) return;
    replaceTrigger(docTag.start, `#${doc.title} `);
    setDocTag(null);
  };

  // Plain insertion at the cursor (no trigger span to replace).
  const insertEmoji = (emoji: string) => {
    const cursor = textareaRef.current?.selectionStart ?? draft.length;
    const before = draft.slice(0, cursor);
    setDraft(`${before}${emoji}${draft.slice(cursor)}`);
    setShowEmojiPicker(false);
    refocusAfter(before.length + emoji.length);
  };

  const handleSend = async () => {
    if (!activeTeamId || sending) return;
    if (!draft.trim() && !pendingFile) return;
    setShowEmojiPicker(false);
    const teamId = activeTeamId; // narrowed copy for the async closure below
    const senderProfile = emailToProfile.get(normEmail(currentUserEmail));
    const teamLabel = activeTeam?.name || 'Team Chat';
    const toNotify = [...mentionedProfiles.values()];
    setSending(true);
    setSendError('');
    try {
      await hrActions.sendMessage(activeTeamId, currentUserEmail, senderProfile?.fullName || currentUserEmail, draft, pendingFile || undefined, draftIsAnnouncement);
      setDraft('');
      setPendingFile(null);
      setMentionedProfiles(new Map());
      setMention(null);
      setDocTag(null);
      setDraftIsAnnouncement(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      lastTypingTouchRef.current = 0;
      hrActions.clearTypingState('chat', activeTeamId, currentUserEmail).catch(() => {});

      // Best-effort: a failed mention notification must not make the message look unsent. Each recipient sees the
      // sender's name as their own role is allowed to (real name or alias), not one fixed name for everyone.
      toNotify.forEach(p => {
        if (p.email.toLowerCase() === currentUserEmail.toLowerCase()) return;
        const nameForRecipient = senderProfile ? displayName(senderProfile, p.role) : currentUserEmail;
        hrActions
          .addNotification(p.email, p.role, `${nameForRecipient} mentioned you in ${teamLabel} chat.`, 'chat_mention', nameForRecipient, currentUserEmail, buildNotificationLink(p.role, 'chat', teamId))
          .catch(err => console.error('Mention notification failed:', err));
      });

      // HR & Admin Line: a regular (non-forward) message typed straight into this fixed channel also notifies the
      // OTHER role; forwards have their own wording (hrActions.forwardToHrAdminLine).
      if (teamId === HR_ADMIN_LINE_TEAM_ID) {
        const otherRole = currentUserRole === 'hr' ? 'admin' : currentUserRole === 'admin' ? 'hr' : null;
        if (otherRole) {
          const nameForOther = senderProfile?.fullName || currentUserEmail;
          hrActions
            .addNotification('all', otherRole, `${nameForOther} sent a message in HR & Admin.`, 'hr_admin_line', nameForOther, currentUserEmail, buildNotificationLink(otherRole, 'hr_admin', teamId))
            .catch(err => console.error('HR & Admin Line notification failed:', err));
        }
      }
    } catch (err) {
      console.error('Send message failed:', err);
      setSendError('Could not send that message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return {
    draft, setDraft, pendingFile, setPendingFile, sending, sendError, mention, setMention, docTag, setDocTag,
    draftIsAnnouncement, setDraftIsAnnouncement, showEmojiPicker, setShowEmojiPicker,
    fileInputRef, textareaRef, emojiWrapperRef,
    mentionSuggestions, docTagSuggestions,
    handleFilePick, handleDraftChange, pickMention, pickDocTag, insertEmoji, handleSend,
  };
}
