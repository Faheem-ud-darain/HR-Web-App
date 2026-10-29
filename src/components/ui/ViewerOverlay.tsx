'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { XIcon as X } from '@/components/ui/icons';
import { pushModal, popModal } from '@/lib/modalStack';
import { useIsClient } from '@/lib/useIsClient';
import { useDialogFocus } from '@/lib/useDialogFocus';

const ROUND = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-black/55 disabled:opacity-40 md:h-9 md:w-9';

// A round toolbar button for ViewerOverlay: a link when it has an href (download), otherwise a button.
export function ViewerButton({ label, href, download, onClick, disabled, className = '', children }: {
  label: string; href?: string; download?: string; onClick?: () => void; disabled?: boolean; className?: string; children: React.ReactNode;
}) {
  return href
    ? <a href={href} download={download} title={label} aria-label={label} className={`${ROUND} ${className}`}>{children}</a>
    : <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className={`${ROUND} ${className}`}>{children}</button>;
}

interface ViewerOverlayProps {
  // The dialog's accessible name.
  label: string;
  // Left side of the top bar (a file name, a timestamp).
  title?: React.ReactNode;
  // Buttons beside the close button (download, zoom). Use ViewerButton.
  actions?: React.ReactNode;
  onClose: () => void;
  // The stage: an image, a document frame, arrows. Clicking the empty dark area around it closes the viewer.
  children: React.ReactNode;
}

// The full-screen dark viewer under every "look at this file" popup (photos, documents, screenshots): a portal to <body>
// (an ancestor's leftover transform would otherwise trap the fixed overlay), above the regular dialogs (so it can open
// from inside one), registered with the modal stack (the mobile bottom nav hides) and focus-trapped. Escape is caught
// first so a dialog behind it does not also close. Mount it only while it should be showing.
export function ViewerOverlay({ label, title, actions, onClose, children }: ViewerOverlayProps) {
  const mounted = useIsClient();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, mounted);

  useEffect(() => {
    pushModal();
    return () => popModal();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  if (!mounted) return null;
  const closeOnBackdrop = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); };

  return createPortal(
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onClick={closeOnBackdrop} className="fixed inset-0 z-[200] flex flex-col bg-slate-950/90 backdrop-blur-sm fade-enter">
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white" onClick={closeOnBackdrop}>
        <div className="min-w-0 truncate text-xs font-semibold text-slate-200">{title}</div>
        <div className="flex items-center gap-2">
          {actions}
          <ViewerButton label="Close" onClick={onClose}><X className="h-4 w-4" aria-hidden="true" /></ViewerButton>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={closeOnBackdrop}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
