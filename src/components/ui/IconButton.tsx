import React from 'react';

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** What the button does. Spoken by screen readers and shown as the hover hint. */
  label: string;
  children: React.ReactNode;
  /** A small red count in the corner, e.g. unread notifications. Hidden at 0. */
  badge?: number;
  /** A smaller button (32px) for lists and cards; the touch hit area is still full size. */
  size?: 'md' | 'sm' | 'composer';
  /** A plain red dot: something new, no count. */
  dot?: boolean;
  /** plain = no fill until hovered; soft = a grey fill; primary = the orange send button; success and warning are tinted (a Meet link, a pinned announcement that is on). */
  tone?: keyof typeof TONES;
}

const TONES = {
  plain: 'text-slate-500 hover:bg-slate-100',
  soft: 'bg-slate-100 hover:bg-slate-200 text-slate-500',
  primary: 'bg-orange-600 hover:bg-orange-700 text-white shadow-sm disabled:opacity-50',
  success: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200',
  warning: 'bg-amber-500 hover:bg-amber-600 text-white',
};
// composer = the message box's round buttons: 40px to tap on a phone, 36px with a mouse.
const SIZES = { md: 'h-10 w-10', sm: 'h-8 w-8', composer: 'h-10 w-10 md:h-9 md:w-9' };

// The round icon-only button used in the top bar: 40px to tap, one hover look, always named.
export function IconButton({ label, badge = 0, dot = false, size = 'md', tone = 'plain', className = '', children, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={badge > 0 ? `${label} (${badge} unread)` : dot ? `${label} (new activity)` : label}
      title={label}
      className={`relative ${SIZES[size]} shrink-0 rounded-full transition-colors transition-transform active:scale-95 flex items-center justify-center ${TONES[tone]} ${className}`}
      {...props}
    >
      {children}
      {dot && <span aria-hidden="true" className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white presence-dot" />}
      {badge > 0 && (
        <span aria-hidden="true" className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white font-bold text-caption leading-none flex items-center justify-center border border-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}
