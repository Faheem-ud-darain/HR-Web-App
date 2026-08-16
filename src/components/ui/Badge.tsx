import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

export function Badge({ children, variant = 'default', className = '', ...props }: BadgeProps) {
  const variantStyles = {
    // Ensuring high-contrast ratios >= 4.5:1 for light mode
    default: 'bg-slate-100 text-slate-800 border border-slate-200',
    success: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    warning: 'bg-amber-50 text-amber-900 border border-amber-200/60',
    danger: 'bg-rose-50 text-rose-800 border border-rose-200',
    info: 'bg-sky-50 text-sky-800 border border-sky-200',
  };

  return (
    <span 
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
