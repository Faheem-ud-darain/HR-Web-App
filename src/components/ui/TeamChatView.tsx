'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Team, Profile, Message, useMessages, useTeamDocuments, displayName, HR_ADMIN_LINE_TEAM_ID } from '@/lib/hrData';
import { TeamDocumentsPanel } from './TeamDocumentsPanel';
import { ShieldCheck } from 'lucide-react';
import { ImageLightbox } from './ImageLightbox';
import { ForwardToHrAdminModal } from '@/components/ui/ForwardToHrAdminModal';
import { normEmail } from '@/components/ui/chat/chatHelpers';
import { ChatComposer } from '@/components/ui/chat/ChatComposer';
import { ChatMessageList } from '@/components/ui/chat/ChatMessageList';
import { ChannelSelector } from '@/components/ui/chat/ChannelSelector';
import { ChatHeader, PinnedAnnouncements, type ChatPanel } from '@/components/ui/chat/ChatHeader';
import { ChatFilterPanel } from '@/components/ui/chat/ChatFilterPanel';
import { ChannelMembersModal, MessageViewersModal } from '@/components/ui/chat/ChatDialogs';
import { useChatFilters } from '@/components/ui/chat/useChatFilters';
import { useChatReceipts } from '@/components/ui/chat/useChatReceipts';
import { useChatTyping } from '@/components/ui/chat/useChatTyping';
import { useChatComposer } from '@/components/ui/chat/useChatComposer';

interface TeamChatViewProps {
  teams: Team[];
  currentUserEmail: string;
  currentUserRole: 'admin' | 'hr' | 'employee' | 'team_lead';
  allProfiles: Profile[];
  // Admin's dedicated Team Chats page: sees every team (not just their own) and a "viewing every channel" label.
  // Admin can still post in any of them; their messages are made unmistakable to everyone else in the channel.
  oversight?: boolean;
  // If true, injects a virtual "HR & Admin" DM channel for this employee.
  includeHrDirectChannel?: boolean;
  // How the channel selector looks on mobile: a scrolling row of pills (default) or a native <select>.
  mobileSelectorStyle?: 'horizontal' | 'dropdown';
}

// Team chat for every role: a channel list, the open channel's messages with filters, receipts and typing
// indicators, and the composer. The state logic lives in ./chat (useChatComposer, useChatFilters, useChatReceipts,
// useChatTyping) and the screen pieces beside it; this file wires them together.
export function TeamChatView({ teams: propTeams, currentUserEmail, currentUserRole, allProfiles, oversight = false, includeHrDirectChannel = false, mobileSelectorStyle = 'horizontal' }: TeamChatViewProps) {
  const me = allProfiles.find(p => p.email.toLowerCase() === currentUserEmail.toLowerCase());

  // An employee can also get a virtual "HR & Admin" direct channel, always first in the list.
  const teams = React.useMemo(() => {
    if (!includeHrDirectChannel || !me) return propTeams;
    const hrTeam: Team = { id: `dm_${me.id}`, name: 'HR & Admin', members: [] }; // virtual: the members list is unused for DMs
    return [hrTeam, ...propTeams];
  }, [includeHrDirectChannel, me, propTeams]);

  const [activeTeamId, setActiveTeamId] = useState<string | null>(teams[0]?.id || null);

  // Deep link from a notification click (?teamId=...): one shot, read from window.location.search (same approach
  // as TicketsView's ?ticketId=). Wins over the first-team default, but only if the linked team is one this viewer
  // can see.
  const appliedChatDeepLinkRef = useRef(false);
  useEffect(() => {
    if (activeTeamId || teams.length === 0) return;
    if (!appliedChatDeepLinkRef.current && typeof window !== 'undefined') {
      const targetId = new URLSearchParams(window.location.search).get('teamId');
      if (targetId && teams.some(t => t.id === targetId)) {
        appliedChatDeepLinkRef.current = true;
        // Genuinely an effect: it reads window.location (external, client-only) and follows up with a real side
        // effect on the same system (history.replaceState strips the param), not a plain prop-driven state reset.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveTeamId(targetId);
        window.history.replaceState(null, '', window.location.pathname);
        return;
      }
      // Nothing to link to (bad id, or not on that team): do not retry every render, fall through to the default.
      appliedChatDeepLinkRef.current = true;
    }
    setActiveTeamId(teams[0].id);
  }, [teams, activeTeamId]);

  const [messageLimit, setMessageLimit] = useState(50);
  const { data: messages = [], isLoading } = useMessages(activeTeamId, messageLimit);
  const { data: teamDocuments = [] } = useTeamDocuments(activeTeamId);
  const docTagList = teamDocuments.map(d => ({ title: d.title, url: d.fileUrl }));

  const emailToProfile = new Map(allProfiles.map(p => [normEmail(p.email), p]));
  const activeTeam = teams.find(t => t.id === activeTeamId);
  // The HR & Admin Line is a permanent two-party channel, so it gets its own card styling: "was this HR or Admin"
  // has to be unmistakable. Everywhere else keeps the usual self / other bubbles.
  const isHrAdminLine = activeTeamId === HR_ADMIN_LINE_TEAM_ID;
  // Who can upload/delete Team Documents: Admin and HR always, a Team Lead only for a team they actually lead.
  const canManageDocuments =
    currentUserRole === 'admin' ||
    currentUserRole === 'hr' ||
    (currentUserRole === 'team_lead' && !!activeTeam?.leadEmail && activeTeam.leadEmail.toLowerCase() === currentUserEmail.toLowerCase());
  // Who can be @mentioned: everyone on the team plus every Admin (they can post, so be mentioned, in any channel).
  // Includes the viewer on purpose: the same list highlights mentions in already-sent messages, and leaving
  // yourself out would mean a message mentioning you is never highlighted in your own view. Resolved live so it
  // stays right as membership, roles and aliases change.
  const mentionCandidates: Profile[] = (() => {
    const emails = new Set((activeTeam?.members || []).map(e => e.toLowerCase()));
    allProfiles.forEach(p => { if (p.role === 'admin') emails.add(p.email.toLowerCase()); });
    return [...emails].map(e => emailToProfile.get(e)).filter((p): p is Profile => !!p);
  })();
  const mentionLabels = mentionCandidates.map(p => displayName(p, currentUserRole));

  // Sender names resolve live through the current profile / alias, not the stored snapshot, so a later alias edit
  // also applies to old messages. A deleted sender falls back to the snapshot (the alias guarantee only ever
  // covered accounts that still exist).
  const senderLabel = (m: Message): string => {
    const profile = emailToProfile.get(normEmail(m.senderEmail));
    return profile ? displayName(profile, currentUserRole) : m.senderName;
  };

  const filters = useChatFilters(messages, emailToProfile);
  const receipts = useChatReceipts({ activeTeamId, teamName: activeTeam?.name, messages, currentUserEmail, allProfiles });
  const typing = useChatTyping({ activeTeamId, currentUserEmail, messageCount: messages.length });
  const composer = useChatComposer({
    activeTeamId, activeTeam, currentUserEmail, currentUserRole, emailToProfile, teamDocuments,
    // The dropdown leaves yourself out: mentioning yourself is not useful.
    mentionDropdownCandidates: mentionCandidates.filter(p => p.email.toLowerCase() !== currentUserEmail.toLowerCase()),
  });

  const [activePanel, setActivePanel] = useState<ChatPanel>('chat');
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  // Image attachments open in the app's own lightbox: an <a target="_blank"> to a base64 data: URL is handed to an
  // external browser intent in the Capacitor/Android WebView and fails or opens a blank tab.
  const [lightbox, setLightbox] = useState<{ src: string; name?: string } | null>(null);
  const [forwardTarget, setForwardTarget] = useState<{ sourceLabel: string; sourceId: string; preview: string; attachmentUrl?: string; attachmentName?: string } | null>(null);
  const canForward = currentUserRole === 'hr' || currentUserRole === 'admin';
  const openForwardModal = (m: Message) => setForwardTarget({
    sourceLabel: activeTeam?.name || 'Team Chat',
    sourceId: activeTeamId || '',
    preview: m.text || (m.attachmentName ? `Attachment: ${m.attachmentName}` : ''),
    attachmentUrl: m.attachmentUrl,
    attachmentName: m.attachmentName,
  });

  // Switching channel starts clean: a message window, filter, mention selection or typing line from one channel
  // means nothing in another. Done during render (React's documented "adjust state when a prop changes" pattern)
  // so nothing ever renders one frame with the previous channel's state.
  const [resetForTeamId, setResetForTeamId] = useState(activeTeamId);
  if (activeTeamId !== resetForTeamId) {
    setResetForTeamId(activeTeamId);
    setMessageLimit(50);
    filters.reset();
    composer.resetForChannel();
    typing.resetTyping();
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, activeTeamId, typing.typingNames.length]);

  if (teams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
        <ShieldCheck className="h-10 w-10 opacity-30" />
        <p className="font-semibold text-sm">{oversight ? 'No teams exist yet.' : "You're not assigned to a team yet."}</p>
      </div>
    );
  }

  const teamName = activeTeam?.name || 'Team Chat';
  const announcements = messages.filter(m => m.isAnnouncement);

  return (
    <div className="flex flex-col md:flex-row gap-2 md:gap-4 flex-1 h-full min-h-0">
      {teams.length > 1 && (
        <ChannelSelector teams={teams} activeTeamId={activeTeamId} onSelect={setActiveTeamId} oversight={oversight} mobileStyle={mobileSelectorStyle} />
      )}

      <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden min-h-0">
        <ChatHeader
          teamName={teamName}
          oversight={oversight}
          panel={activePanel}
          onPanel={setActivePanel}
          documentCount={teamDocuments.length}
          announcementCount={announcements.length}
          showAnnouncements={showAnnouncements}
          onToggleAnnouncements={() => setShowAnnouncements(v => !v)}
          memberCount={mentionCandidates.length}
          onShowMembers={() => setShowMembers(true)}
          showFilters={filters.showFilters}
          onToggleFilters={() => filters.setShowFilters(v => !v)}
          hasActiveFilters={filters.hasActiveFilters}
          filteredCount={filters.filteredMessages.length}
        />

        {activePanel === 'documents' && (
          <TeamDocumentsPanel
            team={activeTeam || null}
            currentUserEmail={currentUserEmail}
            currentUserRole={currentUserRole}
            currentUserName={emailToProfile.get(normEmail(currentUserEmail))?.fullName || currentUserEmail}
            canManage={canManageDocuments}
          />
        )}

        {activePanel === 'chat' && showAnnouncements && announcements.length > 0 && <PinnedAnnouncements announcements={announcements} senderLabel={senderLabel} />}
        {activePanel === 'chat' && filters.showFilters && <ChatFilterPanel filters={filters} />}

        {activePanel === 'chat' && (
          <>
            <ChatMessageList
              scrollRef={scrollRef}
              messages={messages}
              messageLimit={messageLimit}
              setMessageLimit={setMessageLimit}
              isLoading={isLoading}
              filteredMessages={filters.filteredMessages}
              currentUserEmail={currentUserEmail}
              senderLabel={senderLabel}
              emailToProfile={emailToProfile}
              normEmail={normEmail}
              canForward={canForward}
              openForwardModal={openForwardModal}
              mentionLabels={mentionLabels}
              docTagList={docTagList}
              onOpenImage={(src, name) => setLightbox({ src, name })}
              viewersForMessage={receipts.viewersForMessage}
              openMessageViewers={receipts.openMessageViewers}
              currentUserRole={currentUserRole}
              isHrAdminLine={isHrAdminLine}
              typingNames={typing.typingNames}
            />
            <ChatComposer {...composer} oversight={oversight} activeTeam={activeTeam} currentUserRole={currentUserRole} teamDocuments={teamDocuments} />
          </>
        )}
      </div>

      <ImageLightbox src={lightbox?.src ?? null} alt={lightbox?.name} downloadName={lightbox?.name} onClose={() => setLightbox(null)} />

      {receipts.viewersMsgId && (
        <MessageViewersModal viewers={receipts.viewersForMessage(receipts.viewersMsgId)} viewerRole={currentUserRole} onClose={() => receipts.setViewersMsgId(null)} />
      )}
      {showMembers && (
        <ChannelMembersModal teamName={teamName} members={mentionCandidates} viewerRole={currentUserRole} viewerEmail={currentUserEmail} onClose={() => setShowMembers(false)} />
      )}
      {forwardTarget && (
        <ForwardToHrAdminModal
          sender={{ email: currentUserEmail, name: emailToProfile.get(normEmail(currentUserEmail))?.fullName || currentUserEmail, role: currentUserRole === 'admin' ? 'admin' : 'hr' }}
          kind="chat"
          sourceLabel={forwardTarget.sourceLabel}
          sourceId={forwardTarget.sourceId}
          heading={`From ${forwardTarget.sourceLabel}`}
          body={forwardTarget.preview}
          attachmentName={forwardTarget.attachmentName}
          attachmentUrl={forwardTarget.attachmentUrl}
          noun="message"
          onClose={() => setForwardTarget(null)}
        />
      )}
    </div>
  );
}
