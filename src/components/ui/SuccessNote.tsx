import React from 'react';
import { CheckCircleIcon as CheckCircle2 } from '@/components/ui/icons';

// The green confirmation box, the counterpart of FormError. Renders nothing for an empty message.
export function SuccessNote({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <div role="status" className={`p-3 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg font-semibold flex items-center gap-1.5 ${className}`}>
      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />{children}
    </div>
  );
}
