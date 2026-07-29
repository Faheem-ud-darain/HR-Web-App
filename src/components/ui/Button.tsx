'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

// Every button in this app used to be a hand-typed Tailwind string —
// dozens of near-identical variants (rounded-lg vs rounded-xl, text-xs vs
// text-sm, font-bold vs font-semibold, px-3 vs px-4) that drifted apart
// page by page. This is the one shared source of truth going forward:
// same radius as Card/Modal (rounded-xl, 12px — DESIGN.md's stated cap),
// same 150ms snappy transition + scale(0.97) press feedback defined
// globally in globals.css, same weight/size scale everywhere.
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-orange-600 hover:bg-orange-700 text-white disabled:bg-orange-300',
  secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50',
  danger: 'bg-rose-600 hover:bg-rose-700 text-white disabled:bg-rose-300',
  warning: 'bg-amber-600 hover:bg-amber-700 text-white disabled:bg-amber-300',
  // Text-only, for low-emphasis actions inline with content (e.g. "View all →").
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-600 disabled:opacity-50',
  // Bordered, for a secondary action that still needs to read as a real
  // button next to a primary one (e.g. "Cancel" beside "Save").
  outline: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 disabled:opacity-50',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  // min-h-[36px] on sm — at text-[10px]/py-1.5 this was resolving to
  // roughly 26px tall, under any reasonable touch-target floor. 36px
  // matches the app's own existing convention for compact tappable
  // controls (see Modal.tsx's icon-only close button) rather than
  // reaching for Apple's full 44pt, which would make sm visually
  // indistinguishable from md in this dense ops-dashboard UI.
  sm: 'text-[10px] px-2.5 py-1.5 gap-1 min-h-[36px]',
  md: 'text-xs px-4 py-2.5 gap-1.5',
  lg: 'text-sm px-5 py-3 gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center rounded-xl font-bold
        transition-colors transition-transform duration-200 ease-out active:scale-97
        disabled:cursor-not-allowed disabled:active:scale-100
        ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${fullWidth ? 'w-full' : ''} ${className}
      `}
      {...props}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}
