'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '@/lib/useDialogFocus';
import { useIsClient } from '@/lib/useIsClient';
import { popModal, pushModal } from '@/lib/modalStack';

// A small floating card in the middle of the screen on a dimmed page (on a phone too, unlike Modal's bottom sheet), for a
// short friendly message such as "What's new". Clicking outside or pressing Escape closes it. It tells the modal stack it is
// open, so the phone's bottom bar steps aside.
export function PopupCard({ isOpen, onClose, label, children }: { isOpen: boolean; onClose: () => void; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useIsClient();
  useDialogFocus(ref, isOpen && mounted);
  useEffect(() => {
    if (!isOpen) return;
    pushModal();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { popModal(); document.removeEventListener('keydown', onKey); };
  }, [isOpen, onClose]);
  if (!isOpen || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className="relative w-full max-w-sm animate-[enter-modal_200ms_ease-out_forwards] overflow-hidden rounded-2xl shadow-2xl outline-none">
        {children}
      </div>
    </div>,
    document.body,
  );
}
