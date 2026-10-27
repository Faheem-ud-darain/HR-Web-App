import React from 'react';

export type StatusDotTone = 'emerald' | 'amber' | 'rose' | 'orange' | 'slate';

const TONE: Record<StatusDotTone, string> = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  orange: 'bg-orange-500',
  slate: 'bg-slate-300',
};

const SIZE = { xs: 'h-1.5 w-1.5', sm: 'h-2 w-2' } as const;

interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone: StatusDotTone;
  size?: keyof typeof SIZE;
  // Gentle pulse for "live" states (on shift, live chat).
  pulse?: boolean;
}

// The small coloured dot next to a status label ("On Shift", "Active", "Live"), or on its own as a legend key.
export function StatusDot({ tone, size = 'xs', pulse = false, className = '', ...props }: StatusDotProps) {
  return <span aria-hidden="true" className={`inline-block shrink-0 rounded-full ${SIZE[size]} ${TONE[tone]} ${pulse ? 'animate-pulse' : ''} ${className}`} {...props} />;
}
