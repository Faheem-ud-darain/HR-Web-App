'use client';

import React from 'react';
import { ArrowLeftIcon as ArrowLeft, HeadsetIcon as Headset, LockIcon as Lock, ArrowCounterClockwiseIcon as RotateCcw, ArrowBendUpRightIcon as Forward, EyeIcon as Eye } from '@/components/ui/icons';
import { Badge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/IconButton';
import { IconLabelButton } from '@/components/ui/IconLabelButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { TicketReplyLog } from '@/components/ui/tickets/TicketReplyLog';
import { TicketComposer } from '@/components/ui/tickets/TicketComposer';
import { Ticket, Profile, TicketSeenState } from '@/lib/hrData';

interface TicketConversationPanelProps {
  selectedTicket: Ticket | null;
  keyboardHeight: number;
  setSelectedTicket: React.Dispatch<React.SetStateAction<Ticket | null>>;
  isEmp: boolean;
  isTicketLiveWithHR: (ticketId: string) => boolean;
  isPrivileged: boolean;
  canCloseOwnTicket: boolean;
  isClosed: boolean;
  handleCloseTicket: (id: string) => void;
  updatingTicketStatusId: string | null;
  handleReopenTicket: (id: string) => void;
  canForwardToHrAdmin: boolean;
  openForward: (ticket: Ticket) => void;
  handleInspectApplicant: (email: string) => void;
  nameFor: (name: string) => string;
  currentEmail: string;
  userProfile: Profile | null;
  profileFor: (name: string) => Profile | undefined;
  role: "admin" | "hr" | "employee" | "team_lead";
  ticketSeenState: TicketSeenState | null | undefined;
  onOpenImage: (src: string, name?: string) => void;
  typingNames: string[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  isAdmin: boolean;
  onReplySent: () => void;
}

export function TicketConversationPanel({ selectedTicket, keyboardHeight, setSelectedTicket, isEmp, isTicketLiveWithHR, isPrivileged, canCloseOwnTicket, isClosed, handleCloseTicket, updatingTicketStatusId, handleReopenTicket, canForwardToHrAdmin, openForward, handleInspectApplicant, nameFor, currentEmail, userProfile, profileFor, role, ticketSeenState, onOpenImage, typingNames, scrollRef, isAdmin, onReplySent }: TicketConversationPanelProps) {
  return (
    <div
      className={`lg:col-span-7 ${!selectedTicket ? 'hidden lg:block' : 'block fixed inset-0 z-40 bg-white lg:static lg:z-auto lg:bg-transparent'}`}
      style={selectedTicket && keyboardHeight > 0 ? { paddingBottom: keyboardHeight } : undefined}
    >
      {selectedTicket ? (
        <div className="border-0 lg:border border-slate-200 overflow-hidden flex flex-col h-full lg:h-[calc(100vh-220px)] lg:min-h-[560px] lg:rounded-xl bg-white">
          {/* Header. The top padding clears the phone's status bar and notch (the panel is full-screen on a phone). */}
          <div className="px-3.5 lg:px-5 pt-[max(20px,env(safe-area-inset-top))] pb-2.5 lg:pb-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <IconButton label="Back to tickets" size="sm" className="lg:hidden" onClick={() => setSelectedTicket(null)}><ArrowLeft className="h-5 w-5" /></IconButton>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 truncate min-w-0">
                  <span className="truncate">{selectedTicket.title}</span>
                  {isEmp && isTicketLiveWithHR(selectedTicket.id) && <Badge variant="success" size="sm" className="shrink-0 gap-1"><Headset className="h-3.5 w-3.5" /> Live</Badge>}
                </h3>
                <div className="flex items-center gap-2 shrink-0">
                  {(isPrivileged || canCloseOwnTicket) && !isClosed && (
                    <IconLabelButton variant="softRose" icon={<Lock className="h-3.5 w-3.5 shrink-0" />} label="Close Ticket" title="Close Ticket" loading={updatingTicketStatusId === selectedTicket.id} disabled={updatingTicketStatusId === selectedTicket.id} onClick={() => handleCloseTicket(selectedTicket.id)} />
                  )}
                  {isPrivileged && isClosed && (
                    <IconLabelButton variant="outline" icon={<RotateCcw className="h-3.5 w-3.5 shrink-0" />} label="Re-open Ticket" title="Re-open Ticket" loading={updatingTicketStatusId === selectedTicket.id} disabled={updatingTicketStatusId === selectedTicket.id} onClick={() => handleReopenTicket(selectedTicket.id)} />
                  )}
                  {isClosed && !isPrivileged && <Badge variant="danger" size="sm" className="gap-1 uppercase tracking-wider"><Lock className="h-3.5 w-3.5" /> Closed</Badge>}
                  {/* Forwarding is open on closed tickets too, like the list row's Forward. */}
                  {canForwardToHrAdmin && <IconLabelButton variant="outline" icon={<Forward className="h-3.5 w-3.5 shrink-0" />} label="Forward" title="Forward to HR & Admin" onClick={() => openForward(selectedTicket)} />}
                </div>
              </div>
              <div className="text-caption text-slate-600 font-bold mt-0.5 flex items-center gap-1.5 min-w-0">
                <span className="shrink-0 whitespace-nowrap">Opened by:</span>
                <button onClick={() => handleInspectApplicant(selectedTicket.employeeEmail)} className="text-orange-700 hover:underline flex items-center gap-0.5 min-w-0">
                  <span className="truncate min-w-0">{nameFor(selectedTicket.employeeName)}</span>
                  <Eye className="h-3.5 w-3.5 shrink-0" />
                </button>
              </div>
            </div>
          </div>

          {/* Chat replies log */}
          <TicketReplyLog currentEmail={currentEmail} selectedTicket={selectedTicket} userProfile={userProfile} profileFor={profileFor} nameFor={nameFor} role={role} isPrivileged={isPrivileged} ticketSeenState={ticketSeenState} onOpenImage={onOpenImage} typingNames={typingNames} scrollRef={scrollRef} />
    
          <TicketComposer key={selectedTicket.id} isClosed={isClosed} selectedTicket={selectedTicket} isAdmin={isAdmin} role={role} currentEmail={currentEmail} userProfile={userProfile} onSent={onReplySent} />
        </div>
      ) : (
        <EmptyState bordered py={12} size="sm" className="py-32">Select a support ticket from the list to read the conversation.</EmptyState>
      )}
    </div>
  );
}
