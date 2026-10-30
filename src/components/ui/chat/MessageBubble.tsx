import React from 'react';
import { Avatar } from '@/components/ui/Avatar';

// The one look of a message in a conversation, for team chat, direct messages, the HR & Admin line and ticket replies:
// a row with the sender's photo, and a bubble that sits on the right when it is mine and the left when it is theirs.

/** The bubble's colours: mine, theirs, an Admin's (purple, stands out in every viewer's chat), a role-coloured card (the
 *  HR & Admin line, where the sender's role matters more than who is reading), or HR's reply seen by Admin. */
export type BubbleTone = 'own' | 'other' | 'admin' | 'hr-card' | 'admin-card' | 'hr-reply';

const TONES: Record<BubbleTone, string> = {
  own: 'bg-bubble-own text-white',
  other: 'bg-slate-100 text-slate-800',
  admin: 'bg-purple-600 text-white ring-2 ring-purple-200',
  'hr-card': 'bg-white border border-sky-300 text-slate-800',
  'admin-card': 'bg-white border border-purple-300 text-slate-800',
  'hr-reply': 'bg-orange-50/80 border-2 border-orange-300/80 text-slate-800',
};

/** The sender's photo beside a column: the meta line, the bubble and anything under it (a receipt). */
export function MessageRow({ own, name, picture, children }: { own: boolean; name: string; picture?: string; children: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-2 ${own ? 'flex-row-reverse' : ''}`}>
      <Avatar src={picture} name={name} size={28} className="shrink-0" />
      <div className={`flex min-w-0 max-w-[80%] flex-col ${own ? 'items-end' : 'items-start'}`}>{children}</div>
    </div>
  );
}

export function MessageBubble({ own, tone, children }: { own: boolean; tone: BubbleTone; children: React.ReactNode }) {
  return <div className={`rounded-2xl px-3.5 py-2.5 text-xs font-medium leading-relaxed ${own ? 'rounded-tr-sm' : 'rounded-tl-sm'} ${TONES[tone]}`}>{children}</div>;
}
