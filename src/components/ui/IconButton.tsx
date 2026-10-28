import React from 'react';

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** What the button does. Spoken by screen readers and shown as the hover hint. */
  label: string;
  children: React.ReactNode;
  /** A small red count in the corner, e.g. unread notifications. Hidden at 0. */
  badge?: number;
  /** A plain red dot: something new, no count. */
  dot?: boolean;
}

// The round icon-only button used in the top bar: 40px to tap, one hover look, always named.
export function IconButton({ label, badge = 0, dot = false, className = '', children, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={badge > 0 ? `${label} (${badge} unread)` : dot ? `${label} (new activity)` : label}
      title={label}
      className={`relative h-10 w-10 shrink-0 rounded-full text-slate-500 hover:bg-slate-100 transition-colors flex items-center justify-center ${className}`}
      {...props}
    >
      {children}
      {dot && <span aria-hidden="true" className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white presence-dot" />}
      {badge > 0 && (
        <span aria-hidden="true" className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white font-bold text-[11px] leading-none flex items-center justify-center border border-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}
