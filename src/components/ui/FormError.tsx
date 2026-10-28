import React from 'react';
import { WarningCircleIcon as AlertCircle } from '@phosphor-icons/react/dist/ssr';

// The red message box at the top of a form when saving fails. Renders nothing for an empty message.
export function FormError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="p-3 text-xs bg-rose-50 text-rose-600 border border-rose-100 rounded-lg font-semibold flex items-center gap-1.5">
      <AlertCircle className="h-4 w-4 shrink-0" />{children}
    </div>
  );
}
