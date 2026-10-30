'use client';

import React from 'react';
import Link from 'next/link';
import { CircleNotchIcon as Loader2 } from '@/components/ui/icons';

// Every button in this app used to be a hand-typed Tailwind string —
// dozens of near-identical variants (rounded-lg vs rounded-xl, text-xs vs
// text-sm, font-bold vs font-semibold, px-3 vs px-4) that drifted apart
// page by page. This is the one shared source of truth going forward:
// same radius as Card/Modal (rounded-xl, 12px — DESIGN.md's stated cap),
// same 150ms snappy transition + scale(0.97) press feedback defined
// globally in globals.css, same weight/size scale everywhere.
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'warning' | 'success' | 'indigo' | 'purple' | 'ghost' | 'outline' | 'ink' | 'softOrange' | 'softAmber' | 'softRose' | 'softEmerald' | 'softIndigo';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-orange-600 hover:bg-orange-700 text-white disabled:bg-orange-300',
  // Black with white text, for a button that sits on the brand orange (the landing page).
  ink: 'bg-black hover:bg-black/80 text-white disabled:opacity-50',
  secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50',
  danger: 'bg-rose-600 hover:bg-rose-700 text-white disabled:bg-rose-300',
  warning: 'bg-amber-600 hover:bg-amber-700 text-white disabled:bg-amber-300',
  success: 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-emerald-300',
  indigo: 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-indigo-300',
  purple: 'bg-purple-600 hover:bg-purple-700 text-white disabled:bg-purple-300',
  // Text-only, for low-emphasis actions inline with content (e.g. "View all →").
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-600 disabled:opacity-50',
  // Bordered, for a secondary action that still needs to read as a real
  // button next to a primary one (e.g. "Cancel" beside "Save").
  outline: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 disabled:opacity-50',
  // Tinted, for a small toggle or action that is "on" (the orange and amber chips) or a gentle warning (close a ticket).
  softOrange: 'bg-orange-100 hover:bg-orange-200 text-orange-700 disabled:opacity-50',
  softAmber: 'bg-amber-100 hover:bg-amber-200 text-amber-700 disabled:opacity-50',
  softIndigo: 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 disabled:opacity-50',
  softEmerald: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 disabled:opacity-50',
  softRose: 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 disabled:opacity-50',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  // A compact chip for a toolbar or a message header (no touch-height floor: the row around it supplies the room).
  xs: 'text-caption px-2 py-1.5 gap-1',
  // min-h-[36px] on sm — at text-caption/py-1.5 this was resolving to
  // roughly 26px tall, under any reasonable touch-target floor. 36px
  // matches the app's own existing convention for compact tappable
  // controls (see Modal.tsx's icon-only close button) rather than
  // reaching for Apple's full 44pt, which would make sm visually
  // indistinguishable from md in this dense ops-dashboard UI.
  sm: 'text-caption px-2.5 py-1.5 gap-1 min-h-[36px]',
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

// A link that looks like a Button (same variants and sizes), so a call to action that navigates is a real <a>.
export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  ...props
}: { href: string; variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-xl font-bold transition-colors transition-transform duration-200 ease-out active:scale-97 ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </Link>
  );
}
