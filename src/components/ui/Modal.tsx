'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
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

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  // Mount/exit state machine (plan 002) — Modal used to unmount instantly on
  // close with no exit transition; this keeps it mounted for the exit
  // animation's duration before actually unmounting. `exiting` is set the
  // moment `isOpen` flips (adjusting state while rendering), cleared by a timer.
  const [exiting, setExiting] = useState(false);
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    setExiting(!isOpen);
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
        role="dialog"
        aria-modal="true"
      >
        {/* Drag handle (mobile only) */}
        <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="h-1 w-10 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-base md:text-lg font-bold text-slate-900 leading-tight">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-950 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <X className="h-5 w-5" />
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
