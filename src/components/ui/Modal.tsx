'use client';

import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { pushModal, popModal } from '@/lib/modalStack';
import { triggerHaptic } from '@/lib/haptics';
import { useIsClient } from '@/lib/useIsClient';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

// Closing should feel a beat quicker than opening (~10% shorter is the
// standard modal convention) — see improve-animations plan 002.
const EXIT_DURATION_MS = 180;

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    onChange => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Mount/exit state machine (plan 002) — Modal used to unmount instantly on
  // close with no exit transition; this keeps it mounted for the exit
  // animation's duration before actually unmounting. `exiting` is set the
  // moment `isOpen` flips (adjusting state while rendering), cleared by a timer.
  const [exiting, setExiting] = useState(false);
  const [wasOpen, setWasOpen] = useState(isOpen);
  // What had focus the moment the dialog opened (read before the dialog's own content, e.g. an autoFocus
  // field, takes focus), so focus can be handed back when it closes.
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    setExiting(!isOpen);
    if (isOpen && typeof document !== 'undefined') setOpener(document.activeElement as HTMLElement | null);
  }
  const shouldRender = isOpen || exiting;
  const closing = exiting && !isOpen;
  const reducedMotion = usePrefersReducedMotion();

  const mounted = useIsClient();

  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(() => setExiting(false), EXIT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [exiting]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Keyboard users: move focus into the dialog when it opens, keep Tab inside it while it is open, and
  // give focus back to whatever opened it when it closes.
  useEffect(() => {
    if (!isOpen || !mounted) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      const first = dialog.querySelector<HTMLElement>(FOCUSABLE);
      (first || dialog).focus();
    }
    const trap = (e: KeyboardEvent) => {
      const dlg = dialogRef.current;
      if (e.key !== 'Tab' || !dlg) return;
      // Only the topmost dialog traps (dialogs are appended to <body> in the order they open).
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== dlg) return;
      const active = document.activeElement;
      // Focus is inside some other overlay (a lightbox, a popup): leave it alone.
      if (active && active !== document.body && !dlg.contains(active)) return;
      const items = Array.from(dlg.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (active === first || !dlg.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !dlg.contains(active))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [isOpen, mounted, opener]);

  // Registers with the shared modal-stack tracker so the mobile floating
  // bottom nav (Sidebar.tsx) knows to hide itself — see lib/modalStack.ts
  // for why this is necessary instead of relying on z-index alone.
  useEffect(() => {
    if (isOpen) {
      pushModal();
      triggerHaptic.medium();
      return () => {
        popModal();
        triggerHaptic.light();
      };
    }
  }, [isOpen]);

  if (!shouldRender || !mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col justify-end md:items-center md:justify-center p-0 md:p-4">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-200 ${closing ? 'opacity-0' : 'opacity-100'}`}
        onClick={onClose}
      />

      {/* Modal Container — bottom sheet on mobile, centered card on desktop */}
      <div
        className={`
          relative bg-white w-full shadow-2xl overflow-hidden
          rounded-t-[32px] md:rounded-xl
          max-h-[92vh] md:max-h-[85vh]
          md:max-w-lg
          flex flex-col
          ${closing ? 'md:animate-[exit-modal_180ms_ease-out_forwards] animate-[drawer-exit-bottom_180ms_ease-out_forwards]' : 'md:animate-[enter-modal_200ms_ease-out_forwards] animate-[drawer-in-bottom_320ms_ease-out_forwards]'}
          ${className || ''}
        `}
        style={reducedMotion ? { animation: 'none' } : undefined}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {/* Drag handle (mobile only) */}
        <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="h-1 w-10 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 flex-shrink-0">
          <h2 id={titleId} className="text-base md:text-lg font-bold text-slate-900 leading-tight">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-950 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content — scrollable. Uses an arbitrary-value padding-bottom
            (below) instead of `py-4 pb-safe` — both would set
            padding-bottom at the same cascade specificity, so the last
            one Tailwind happens to emit wins; this way the safe-area
            inset is additive to the base 1rem instead of racing it.
            See globals.css's .pb-safe comment. NOTE: don't write the
            arbitrary-value syntax itself (word, bracket, calc, bracket)
            in a comment with a "..." placeholder — Tailwind's class
            scanner reads comments too and will try to generate CSS for
            the literal placeholder text, which is invalid and breaks
            the whole stylesheet build. Spell out the real value instead. */}
        <div className="px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
