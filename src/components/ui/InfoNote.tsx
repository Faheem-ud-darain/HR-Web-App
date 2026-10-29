import React from 'react';
import { InfoIcon as Info } from '@/components/ui/icons';

// A blue explanation box, the neutral counterpart of FormError and SuccessNote. Renders nothing for an empty message.
export function InfoNote({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <div role="note" className={`flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900 ${className}`}>
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
