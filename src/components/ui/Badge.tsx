import React from 'react';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'indigo';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: BadgeVariant;
  // md = regular label; sm = compact chip for dense lists, tables and cards.
  size?: 'sm' | 'md';
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  // Ensuring high-contrast ratios >= 4.5:1 for light mode
  default: 'bg-slate-100 text-slate-800 border border-slate-200',
  success: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
  warning: 'bg-amber-50 text-amber-900 border border-amber-200/60',
  danger: 'bg-rose-50 text-rose-800 border border-rose-200',
  info: 'bg-sky-50 text-sky-800 border border-sky-200',
  indigo: 'bg-indigo-50 text-indigo-800 border border-indigo-200',
};

const SIZE_STYLES = {
  md: 'px-2.5 py-0.5 text-xs font-semibold',
  sm: 'px-2 py-0.5 text-caption font-bold',
};

export function Badge({ children, variant = 'default', size = 'md', className = '', ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full ${SIZE_STYLES[size]} ${VARIANT_STYLES[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
