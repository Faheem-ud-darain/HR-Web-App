'use client';

import React from 'react';
import { ArrowLeftIcon as ArrowLeft, HeadsetIcon as Headset, CircleNotchIcon as Loader2, LockIcon as Lock, ArrowCounterClockwiseIcon as RotateCcw, ArrowBendUpRightIcon as Forward, EyeIcon as Eye } from '@phosphor-icons/react/dist/ssr';
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
          {/* Header. Arbitrary-value pt (not `py-2.5 lg:py-4 pt-safe`
              combined) — this file's own globals.css comment warns that
              a bare .pt-safe/.pb-safe class stacked with a Tailwind
              padding shorthand touching the same side is a same-
              specificity cascade collision that can silently compile
              away to nothing. This panel is `fixed inset-x-0 top-0` on
              mobile (see the wrapping div above), which on notched/
              Dynamic-Island iPhones put the ticket title under the
              status bar with no way to tap "back" — and on Android,
              with zero top inset to add, it needs the same 12px
              minimum floor .pt-safe now gives everywhere else. Both
              env() and the pb-2.5/lg:pb-4 base are folded into one
              calc() per breakpoint instead. */}
          <div className="px-3.5 lg:px-5 pt-[max(20px,env(safe-area-inset-top))] pb-2.5 lg:pb-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 md:gap-4">
            {/* `grow` (flex-grow only) instead of `flex-1` — flex-1 sets
                the `flex` shorthand (flex: 1 1 0%), which stomps on
                basis-full's flex-basis: 100% depending on Tailwind's
                generated stylesheet order (same same-property cascade
                collision as the pt-safe/pb-safe bug — see globals.css).
                That silently kept this block from actually taking the
                full row width on mobile, so it never wrapped onto its
                own line and the Operations button got squeezed onto
                the same row instead of the row below it. */}
            {/* items-center (not items-start on mobile) — vertically
                centers the back button against the full two-line
                title + "Opened by" block, not just top-aligned with
                the title's line alone. */}
            <div className="flex items-center gap-2 grow min-w-0">
              {/* No background box, matching TopNav's chat-screen back
                  button (TopNav.tsx) — just an icon, not a filled pill. */}
              <button onClick={() => setSelectedTicket(null)} className="lg:hidden h-8 w-8 shrink-0 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                {/* Title row + Operations now share one row (previously
                    Operations was a separate div pushed onto its own
                    wrapped flex line via ml-auto — which visually read
                    as "floating, disconnected from the title" rather
                    than inline with it). justify-between here does the
                    right-alignment instead. */}
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 truncate min-w-0">
                    <span className="truncate">{selectedTicket.title}</span>
                    {isEmp && isTicketLiveWithHR(selectedTicket.id) && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-caption font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <Headset className="h-3.5 w-3.5" /> Live
                      </span>
                    )}
                  </h3>
                  <div className="flex items-center gap-2 shrink-0">
                    {(isPrivileged || canCloseOwnTicket) && !isClosed && (
                      <button
                        onClick={() => handleCloseTicket(selectedTicket.id)}
                        disabled={updatingTicketStatusId === selectedTicket.id}
                        title="Close Ticket"
                        className="h-8 w-8 lg:w-auto lg:px-3 lg:py-1.5 text-xs font-semibold bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 rounded-lg active:scale-97 transition-colors transition-transform flex items-center justify-center gap-1 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {updatingTicketStatusId === selectedTicket.id ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : <Lock className="h-3.5 w-3.5 shrink-0" />}
                        <span className="hidden lg:inline">Close Ticket</span>
                      </button>
                    )}
                    {isPrivileged && isClosed && (
                      <button
                        onClick={() => handleReopenTicket(selectedTicket.id)}
                        disabled={updatingTicketStatusId === selectedTicket.id}
                        title="Re-open Ticket"
                        className="h-8 w-8 lg:w-auto lg:px-3 lg:py-1.5 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg active:scale-97 transition-colors transition-transform flex items-center justify-center gap-1 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {updatingTicketStatusId === selectedTicket.id ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : <RotateCcw className="h-3.5 w-3.5 shrink-0" />}
                        <span className="hidden lg:inline">Re-open Ticket</span>
                      </button>
                    )}
                    {isClosed && !isPrivileged && (
                      <span className="text-caption font-bold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                        <Lock className="h-3.5 w-3.5" /> Closed
                      </span>
                    )}
                    {/* Available on closed tickets too — no status
                        restriction, matches the list row's Forward
                        action above. */}
                    {canForwardToHrAdmin && (
                      <button
                        onClick={() => { openForward(selectedTicket); }}
                        title="Forward to HR & Admin"
                        className="h-8 w-8 lg:w-auto lg:px-3 lg:py-1.5 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg active:scale-97 transition-colors transition-transform flex items-center justify-center gap-1 shrink-0"
                      >
                        <Forward className="h-3.5 w-3.5 shrink-0" />
                        <span className="hidden lg:inline">Forward</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-caption text-slate-600 font-bold mt-0.5 flex items-center gap-1.5 min-w-0">
                  <span className="shrink-0 whitespace-nowrap">Opened by:</span>
                  <button
                    onClick={() => handleInspectApplicant(selectedTicket.employeeEmail)}
                    className="text-orange-700 hover:underline flex items-center gap-0.5 min-w-0"
                  >
                    <span className="truncate min-w-0">{nameFor(selectedTicket.employeeName)}</span>
                    <Eye className="h-3.5 w-3.5 shrink-0" />
                  </button>
                </div>
              </div>
            </div>
          </div>
    
          {/* Chat replies log */}
          <TicketReplyLog currentEmail={currentEmail} selectedTicket={selectedTicket} userProfile={userProfile} profileFor={profileFor} nameFor={nameFor} role={role} isPrivileged={isPrivileged} ticketSeenState={ticketSeenState} onOpenImage={onOpenImage} typingNames={typingNames} scrollRef={scrollRef} />
    
          {/* Chat input bar. Uses arbitrary-value padding-bottom
              (below) instead of `p-3 md:p-4 pb-safe` — both would set
              padding-bottom at the same cascade specificity; see
              globals.css's .pb-safe comment. Responsive base
              (0.75rem/1rem) preserved, inset added on top of each. */}
          <TicketComposer key={selectedTicket.id} isClosed={isClosed} selectedTicket={selectedTicket} isAdmin={isAdmin} role={role} currentEmail={currentEmail} userProfile={userProfile} onSent={onReplySent} />
        </div>
      ) : (
        <EmptyState bordered py={12} size="sm" className="py-32">Select a support ticket from the list to read the conversation.</EmptyState>
      )}
    </div>
  );
}
