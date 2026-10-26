'use client';

import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ThinkingOrb } from 'thinking-orbs';
import { ChatPanel } from './ChatPanel';
import { ORB_BUSY_DOT_SIZE, ORB_BUSY_SPEED, ORB_COLOR, ORB_DOT_SIZE, ORB_IDLE_SPEED, setAssistantOpen, useAssistantChat, useAssistantOpen } from './assistantStore';

function useReducedMotion(): boolean {
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

// The assistant's floating button (bottom-right) and its small chat window. Rendered by the dashboard
// layout for HR and Admin only. The window is NOT a modal: the page behind stays visible and usable.
export function FloatingAssistant({ role }: { role: 'hr' | 'admin' }) {
  const open = useAssistantOpen();
  const { loading } = useAssistantChat();
  const pathname = usePathname();
  const router = useRouter();
  const reduced = useReducedMotion();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const onAssistantPage = pathname.endsWith('/assistant');

  // Escape closes the small window and hands focus back to the button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) {
        setAssistantOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Real dialogs sit above this (z-100) so they cover it; the ticket screen's full-screen panel (z-40) sits below it.
  if (onAssistantPage) return null;

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Assistant"
          className="fixed bottom-[11rem] right-4 z-[45] h-[560px] max-h-[calc(100vh-13rem)] w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 shadow-2xl md:bottom-24 md:right-6 md:max-h-[70vh]"
        >
          <ChatPanel
            variant="window"
            role={role}
            onClose={() => { setAssistantOpen(false); buttonRef.current?.focus(); }}
            onExpand={() => { setAssistantOpen(false); router.push(`/${role}/assistant`); }}
          />
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setAssistantOpen(!open)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        aria-expanded={open}
        className="fixed bottom-[6.5rem] right-4 z-[45] flex h-16 w-16 items-center justify-center rounded-full transition-transform hover:scale-110 md:bottom-6 md:right-6"
      >
        <ThinkingOrb state={loading ? 'solving' : 'listening'} speed={loading ? ORB_BUSY_SPEED : ORB_IDLE_SPEED} size={64} theme="light" color={ORB_COLOR} dotSize={loading ? ORB_BUSY_DOT_SIZE : ORB_DOT_SIZE} paused={reduced} aria-hidden="true" />
      </button>
    </>
  );
}
