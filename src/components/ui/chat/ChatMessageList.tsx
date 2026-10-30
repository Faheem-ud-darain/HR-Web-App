'use client';

import React from 'react';
import { ChatSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { MegaphoneIcon as Megaphone, CrownIcon as Crown, ArrowBendUpRightIcon as Forward, ArrowSquareOutIcon as ExternalLink } from '@/components/ui/icons';
import { RoleBadge, formatTimestamp, renderMessageText, ReadReceiptFacepile, FORWARD_KIND_LABEL } from '@/components/ui/chat/chatHelpers';
import { MessageAttachment } from '@/components/ui/MessageAttachment';
import { buildNotificationLink, Message, Profile } from '@/lib/hrData';
import { Button, ButtonLink } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { MessageBubble, MessageRow, type BubbleTone } from '@/components/ui/chat/MessageBubble';
import { isOwnChatMessage } from '@/lib/core/messageOwnership';
import { TypingIndicator } from '@/components/ui/TypingIndicator';

interface ChatMessageListProps {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  messages: Message[];
  messageLimit: number;
  setMessageLimit: React.Dispatch<React.SetStateAction<number>>;
  isLoading: boolean;
  filteredMessages: Message[];
  currentUserEmail: string;
  senderLabel: (m: Message) => string;
  emailToProfile: Map<string, Profile>;
  normEmail: (e: string) => string;
  canForward: boolean;
  openForwardModal: (m: Message) => void;
  mentionLabels: string[];
  docTagList: { title: string; url: string; }[];
  onOpenImage: (src: string, name?: string) => void;
  viewersForMessage: (msgId: string) => Profile[];
  openMessageViewers: (msgId: string) => void;
  currentUserRole: "admin" | "hr" | "employee" | "team_lead";
  isHrAdminLine: boolean;
  typingNames: string[];
}

export function ChatMessageList({ scrollRef, messages, messageLimit, setMessageLimit, isLoading, filteredMessages, currentUserEmail, senderLabel, emailToProfile, normEmail, canForward, openForwardModal, mentionLabels, docTagList, onOpenImage, viewersForMessage, openMessageViewers, currentUserRole, isHrAdminLine, typingNames }: ChatMessageListProps) {
  return (
    <div ref={scrollRef} role="log" aria-live="polite" aria-relevant="additions" aria-label="Messages" className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
      {messages.length >= messageLimit && (
        <div className="text-center py-2">
          <Button variant="softOrange" size="xs" className="rounded-full px-3" onClick={() => setMessageLimit(prev => prev + 50)}>Load earlier messages</Button>
        </div>
      )}
      {isLoading && <ChatSkeleton />}
      {!isLoading && messages.length === 0 && (
        <EmptyState py={6} size="xs">No messages yet. Be the first to write one.</EmptyState>
      )}
      {!isLoading && messages.length > 0 && filteredMessages.length === 0 && (
        <EmptyState py={6} size="xs">No messages match your search/filters.</EmptyState>
      )}
      {filteredMessages.map(m => {
        const isSelf = isOwnChatMessage(m.senderEmail, { email: currentUserEmail });
        const label = senderLabel(m);
        const sender = emailToProfile.get(normEmail(m.senderEmail));
        // Admin is automatically in every team channel and can post anywhere, so their messages look the same (purple, with a
        // crown) in every viewer's chat, whether or not the viewer is the admin.
        const isAdminSender = sender?.role === 'admin';
        const roleBadge = isAdminSender ? <Crown className="h-3.5 w-3.5 text-purple-600" /> : <RoleBadge role={sender?.role} />;
        const receipt = isSelf && <ReadReceiptFacepile viewers={viewersForMessage(m.id)} onOpen={() => openMessageViewers(m.id)} />;
        const forwardButton = canForward && (
          <IconButton size="sm" label="Forward to HR & Admin" onClick={() => openForwardModal(m)} className="-my-2 -mr-1 hover:text-orange-600"><Forward className="h-3.5 w-3.5" /></IconButton>
        );

        // An announcement is a full-width pinned banner, not a left or right bubble: it is meant to stand out from the chat.
        if (m.isAnnouncement) {
          return (
            <div key={m.id} className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-caption font-black uppercase tracking-wider text-amber-700">
                <Megaphone className="h-3.5 w-3.5" /> Announcement · {label} {roleBadge}
                <span className="ml-auto flex items-center gap-1.5 font-semibold normal-case text-slate-500">{formatTimestamp(m.timestamp)}{forwardButton}</span>
              </div>
              {m.text && <p className="whitespace-pre-wrap break-words text-xs font-semibold text-slate-800">{renderMessageText(m.text, mentionLabels, docTagList, false)}</p>}
              {m.attachmentUrl && <MessageAttachment url={m.attachmentUrl} name={m.attachmentName} size={m.attachmentSize} spaced={!!m.text} linkClass="text-amber-700" onOpenImage={onOpenImage} />}
              {receipt}
            </div>
          );
        }

        // Forwarded into the HR & Admin line: a card (not a filled bubble) outlined in the sender's role colour, so who
        // forwarded it reads at a glance, with a link back to the original.
        if (m.isForward) {
          const originalHref = m.forwardKind && m.forwardLink ? buildNotificationLink(currentUserRole === 'admin' ? 'admin' : 'hr', m.forwardKind, m.forwardLink) : undefined;
          const text = isAdminSender ? 'text-purple-700' : 'text-sky-700';
          const linkText = isAdminSender ? 'text-purple-700!' : 'text-sky-700!';
          return (
            <MessageRow key={m.id} own={isSelf} name={label} picture={sender?.profilePicture}>
              <MessageBubble own={isSelf} tone={isAdminSender ? 'admin-card' : 'hr-card'}>
                <div className={`mb-1 flex flex-wrap items-center gap-1.5 text-caption font-black uppercase tracking-wider ${text}`}>
                  <Forward className="h-3.5 w-3.5" /> {m.forwardKind ? FORWARD_KIND_LABEL[m.forwardKind] : 'Forwarded'} · {label} {roleBadge}
                  <span className="ml-auto font-semibold normal-case text-slate-500">{formatTimestamp(m.timestamp)}</span>
                </div>
                {m.forwardLabel && <p className="break-words font-bold text-slate-800">{m.forwardLabel}</p>}
                {m.forwardNote && <p className="mt-1 whitespace-pre-wrap break-words font-medium italic text-slate-600">&ldquo;{m.forwardNote}&rdquo;</p>}
                {m.attachmentUrl && <MessageAttachment url={m.attachmentUrl} name={m.attachmentName} size={m.attachmentSize} spaced linkClass={text} onOpenImage={onOpenImage} />}
                {originalHref && (
                  <ButtonLink href={originalHref} variant="outline" size="xs" className={`mt-2 rounded-full ${linkText}`}>View original <ExternalLink className="h-3.5 w-3.5 shrink-0" /></ButtonLink>
                )}
              </MessageBubble>
              {receipt}
            </MessageRow>
          );
        }

        // On the HR & Admin line the bubble takes the sender's ROLE colour (sky for HR, purple for Admin) instead of mine/theirs,
        // because both sides must see who sent it, whichever of them is reading.
        const tone: BubbleTone = isHrAdminLine ? (isAdminSender ? 'admin-card' : 'hr-card') : isAdminSender ? 'admin' : isSelf ? 'own' : 'other';
        const nameColour = isAdminSender ? 'text-purple-700' : isHrAdminLine ? 'text-sky-700' : 'text-slate-600';
        const onFill = tone === 'own' || tone === 'admin';
        return (
          <MessageRow key={m.id} own={isSelf} name={label} picture={sender?.profilePicture}>
            <div className="mb-0.5 flex items-center gap-1.5">
              <span className={`text-caption font-bold ${nameColour}`}>{label}</span>
              {roleBadge}
              <span className="text-caption font-semibold text-slate-500">{formatTimestamp(m.timestamp)}</span>
              {forwardButton}
            </div>
            <MessageBubble own={isSelf} tone={tone}>
              {m.text && <p className="whitespace-pre-wrap break-words">{renderMessageText(m.text, mentionLabels, docTagList, onFill)}</p>}
              {m.attachmentUrl && (
                <MessageAttachment url={m.attachmentUrl} name={m.attachmentName} size={m.attachmentSize} spaced={!!m.text} linkClass={onFill ? 'text-white' : isHrAdminLine ? (isAdminSender ? 'text-purple-700' : 'text-sky-700') : 'text-orange-700'} onOpenImage={onOpenImage} />
              )}
            </MessageBubble>
            {receipt}
          </MessageRow>
        );
      })}
      <TypingIndicator names={typingNames} />
    </div>
  );
}
