import React from 'react';
import { Avatar } from '@/components/ui/Avatar';

interface PersonRowProps {
  name: string;
  src?: string | null;
  // A line under the name (job title, email).
  subtitle?: string;
  // Something on the right: a badge, a button.
  trailing?: React.ReactNode;
  // Tints the row, for the person who matters most in the list (the team lead).
  highlight?: boolean;
  // Makes the person (avatar and name) a button, e.g. to open their profile card.
  onClick?: () => void;
  // Left of the name, over the avatar (a star for a lead).
  badge?: React.ReactNode;
}

// One person in a list: avatar, name, a line under it, and something on the right. Used for team members and leads.
export function PersonRow({ name, src, subtitle, trailing, highlight = false, onClick, badge }: PersonRowProps) {
  const who = (
    <>
      <Avatar src={src} name={name} size={36} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-bold text-slate-900"><span className="truncate">{name}</span>{badge}</span>
        {subtitle && <span className="block truncate text-caption font-semibold text-slate-500">{subtitle}</span>}
      </span>
    </>
  );
  return (
    <div className={`flex items-center gap-3 px-4 md:px-6 py-2.5 ${highlight ? 'bg-purple-50/60' : ''}`}>
      {onClick
        ? <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition-opacity hover:opacity-80">{who}</button>
        : <div className="flex min-w-0 flex-1 items-center gap-3">{who}</div>}
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
