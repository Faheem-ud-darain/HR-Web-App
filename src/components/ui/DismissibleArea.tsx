'use client';

import React, { useEffect, useRef } from 'react';

// A wrapper for a button plus the popover it opens (a menu, the notification list): a press anywhere outside it
// calls `onClose`. The ref lives here, so the callers never handle one.
export function DismissibleArea({ open, onClose, className, children }: { open: boolean; onClose: () => void; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPress = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', onPress);
    return () => document.removeEventListener('mousedown', onPress);
  }, [open, onClose]);
  return <div ref={ref} className={className}>{children}</div>;
}
