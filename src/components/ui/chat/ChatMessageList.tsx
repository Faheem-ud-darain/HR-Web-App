'use client';

import React from 'react';
import { ChatSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { MegaphoneIcon as Megaphone, CrownIcon as Crown, ArrowBendUpRightIcon as Forward, ArrowSquareOutIcon as ExternalLink } from '@phosphor-icons/react/dist/ssr';
import { RoleBadge, formatTimestamp, renderMessageText, ReadReceiptFacepile, FORWARD_KIND_LABEL } from '@/components/ui/chat/chatHelpers';
import { MessageAttachment } from '@/components/ui/MessageAttachment';
import { buildNotificationLink, Message, Profile } from '@/lib/hrData';
import { Avatar } from '@/components/ui/Avatar';
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
          <button
            onClick={() => setMessageLimit(prev => prev + 50)}
            className="text-[11px] font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-full transition-colors"
          >
            Load earlier messages
          </button>
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
        const isSelf = m.senderEmail.toLowerCase() === currentUserEmail.toLowerCase();
        const label = senderLabel(m);
        // Admin is auto-a-member of every team channel and can post
        // anywhere — their messages get a distinct highlighted look
        // (purple + crown badge) in every viewer's chat, self or not,
        // so they're unmistakable next to regular team messages.
        const senderRole = emailToProfile.get(normEmail(m.senderEmail))?.role;
        const isAdminSender = senderRole === 'admin';
    
        // Announcements render full-width and pinned-banner styled,
        // not as a left/right chat bubble — they're meant to stand out
        // from the regular back-and-forth, not blend into it.
        if (m.isAnnouncement) {
          return (
            <div key={m.id} className="border-2 border-amber-300 bg-amber-50 rounded-xl px-4 py-3">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-black text-amber-700 uppercase tracking-wider mb-1">
                <Megaphone className="h-3.5 w-3.5" /> Announcement · {label}
                {isAdminSender ? <Crown className="h-3 w-3 text-purple-600" /> : <RoleBadge role={senderRole} />}
                <span className="text-slate-500 font-semibold normal-case ml-auto flex items-center gap-1.5">
                  {formatTimestamp(m.timestamp)}
                  {canForward && (
                    <button type="button" onClick={() => openForwardModal(m)} title="Forward to HR & Admin" aria-label="Forward to HR & Admin" className="text-slate-500 hover:text-orange-600 transition-colors p-2 -m-2">
                      <Forward className="h-3 w-3" />
                    </button>
                  )}
                </span>
              </div>
              {m.text && (
                <p className="text-xs font-semibold text-slate-800 whitespace-pre-wrap break-words">
                  {renderMessageText(m.text, mentionLabels, docTagList, false)}
                </p>
              )}
              {m.attachmentUrl && (
                <MessageAttachment url={m.attachmentUrl} name={m.attachmentName} size={m.attachmentSize} spaced={!!m.text} linkClass="text-amber-700" onOpenImage={onOpenImage} />
              )}
              {isSelf && <ReadReceiptFacepile viewers={viewersForMessage(m.id)} onOpen={() => openMessageViewers(m.id)} />}
            </div>
          );
        }
    
        // Forwarded messages (HR & Admin Line — see
        // hrActions.forwardToHrAdminLine in hrData.ts) render as their
        // own distinct card — role-colored border on a white
        // background, not the amber full-width banner Announcements
        // use above — but still sit left/right in the normal
        // sender-flow like a regular bubble, sized to their content
        // rather than stretching the full width of the thread.
        if (m.isForward) {
          const kindLabel = m.forwardKind ? FORWARD_KIND_LABEL[m.forwardKind] : 'Forwarded';
          const originalHref = m.forwardKind && m.forwardLink
            // View-original link is resolved from the raw stored id at
            // render time using the *viewer's* own role (this channel
            // is read by both hr and admin) — see the forwardLink
            // comment on the Message interface in hrData.ts.
            ? buildNotificationLink(currentUserRole === 'admin' ? 'admin' : 'hr', m.forwardKind, m.forwardLink)
            : undefined;
          // Forwarded messages only ever land in the HR & Admin Line
          // (see hrActions.forwardToHrAdminLine — nothing else posts
          // isForward: true), so the card is always role-colored: same
          // purple/sky pairing as roleBadgeInfo(), reused here so "who
          // forwarded this" reads at a glance the same way "who sent
          // this" does on a regular message below — a white card with a
          // colored border/accent, not a solid color fill, so it still
          // reads as part of the app rather than a loud banner.
          const c = isAdminSender
            ? { border: 'border-purple-300', text: 'text-purple-700', tag: 'bg-purple-50', btnHover: 'hover:bg-purple-600 hover:border-purple-600' }
            : { border: 'border-sky-300', text: 'text-sky-700', tag: 'bg-sky-50', btnHover: 'hover:bg-sky-600 hover:border-sky-600' };
          // Sits in the same left/right-by-sender flow as a regular
          // bubble below (own messages on your right, the other
          // person's on your left) and only ever takes up as much
          // width as its content needs, capped at 75% — it's a
          // distinct card, not a full-width banner like Announcements.
          return (
            <div key={m.id} className={`flex gap-2 ${isSelf ? 'flex-row-reverse' : ''}`}>
              <Avatar src={emailToProfile.get(normEmail(m.senderEmail))?.profilePicture} name={label} size={28} />
              <div className={`max-w-[75%] flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
                <div className={`border ${c.border} bg-white rounded-xl px-4 py-3 ${isSelf ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}>
                  <div className={`flex flex-wrap items-center gap-1.5 text-[11px] font-black ${c.text} uppercase tracking-wider mb-1`}>
                    <Forward className="h-3.5 w-3.5" /> {kindLabel} · {label}
                    {isAdminSender ? <Crown className="h-3 w-3 text-purple-600" /> : <RoleBadge role={senderRole} />}
                    <span className="text-slate-500 font-semibold normal-case ml-auto">{formatTimestamp(m.timestamp)}</span>
                  </div>
                  {m.forwardLabel && (
                    <p className="text-xs font-bold text-slate-800 break-words">{m.forwardLabel}</p>
                  )}
                  {m.forwardNote && (
                    <p className="text-xs font-medium text-slate-600 italic mt-1 whitespace-pre-wrap break-words">&ldquo;{m.forwardNote}&rdquo;</p>
                  )}
                  {m.attachmentUrl && (
                    <MessageAttachment url={m.attachmentUrl} name={m.attachmentName} size={m.attachmentSize} spaced linkClass={c.text} onOpenImage={onOpenImage} />
                  )}
                  {originalHref && (
                    // Styled as a small pill button (not a plain text link) —
                    // the point of a forward card is a one-glance "here's the
                    // thing, click to jump straight to it" affordance.
                    <a
                      href={originalHref}
                      className={`inline-flex items-center gap-1.5 text-[11px] font-black ${c.text} bg-white border ${c.border} rounded-full px-2.5 py-1 mt-2 ${c.btnHover} hover:text-white transition-colors`}
                    >
                      View original <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  )}
                </div>
                {isSelf && <ReadReceiptFacepile viewers={viewersForMessage(m.id)} onOpen={() => openMessageViewers(m.id)} />}
              </div>
            </div>
          );
        }
    
        // HR & Admin Line: a white card with a role-colored border/
        // text (purple for Admin, sky for HR — same pairing as
        // roleBadgeInfo() and the Forwarded cards above) instead of the
        // solid self/other fill used everywhere else. The point of this
        // channel is "who sent this, HR or Admin" being obvious to BOTH
        // sides regardless of which one of them is reading it right
        // now — a self-vs-other color scheme can't do that (it'd show
        // the same message in a different color to each viewer), so it
        // only applies here; Team Chat/DMs keep their normal bubbles.
        const hrAdminColor = isAdminSender
          ? { border: 'border-purple-300', text: 'text-purple-700', name: 'text-purple-700' }
          : { border: 'border-sky-300', text: 'text-sky-700', name: 'text-sky-700' };
        return (
          <div key={m.id} className={`flex gap-2 ${isSelf ? 'flex-row-reverse' : ''}`}>
            <Avatar src={emailToProfile.get(normEmail(m.senderEmail))?.profilePicture} name={label} size={28} />
            <div className={`max-w-[75%] flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`text-[11px] font-bold ${isHrAdminLine ? hrAdminColor.name : isAdminSender ? 'text-purple-700' : 'text-slate-600'}`}>{label}</span>
                {isAdminSender ? (
                  <span className="flex items-center gap-0.5 bg-purple-100 text-purple-700 text-[11px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full">
                    <Crown className="h-2.5 w-2.5" /> Admin
                  </span>
                ) : (
                  <RoleBadge role={senderRole} />
                )}
                <span className="text-[11px] text-slate-500 font-semibold">{formatTimestamp(m.timestamp)}</span>
                {canForward && (
                  <button type="button" onClick={() => openForwardModal(m)} title="Forward to HR & Admin" aria-label="Forward to HR & Admin" className="text-slate-500 hover:text-orange-600 transition-colors p-2 -m-2">
                    <Forward className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className={`rounded-2xl px-3.5 py-2.5 text-xs font-medium leading-relaxed ${
                isHrAdminLine
                  ? `bg-white border ${hrAdminColor.border} text-slate-800 ` + (isSelf ? 'rounded-tr-sm' : 'rounded-tl-sm')
                  : isAdminSender
                    ? 'bg-purple-600 text-white ring-2 ring-purple-200 ' + (isSelf ? 'rounded-tr-sm' : 'rounded-tl-sm')
                    : isSelf ? 'bg-bubble-own text-white rounded-tr-sm' : 'bg-slate-100 text-slate-800 rounded-tl-sm'
              }`}>
                {m.text && (
                  <p className="whitespace-pre-wrap break-words">
                    {renderMessageText(m.text, mentionLabels, docTagList, !isHrAdminLine && (isAdminSender || isSelf))}
                  </p>
                )}
                {m.attachmentUrl && (
                  <MessageAttachment
                    url={m.attachmentUrl}
                    name={m.attachmentName}
                    size={m.attachmentSize}
                    spaced={!!m.text}
                    linkClass={isHrAdminLine ? hrAdminColor.text : (isAdminSender || isSelf ? 'text-white' : 'text-orange-700')}
                    onOpenImage={onOpenImage}
                  />
                )}
              </div>
              {isSelf && <ReadReceiptFacepile viewers={viewersForMessage(m.id)} onOpen={() => openMessageViewers(m.id)} />}
            </div>
          </div>
        );
      })}
      <TypingIndicator names={typingNames} />
    </div>
  );
}
