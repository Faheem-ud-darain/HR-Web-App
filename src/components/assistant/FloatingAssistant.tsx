'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ThinkingOrb } from 'thinking-orbs';
import { ChatPanel } from './ChatPanel';
import { nudgePool, type Nudge } from './nudges';
import { ORB_BUSY_DOT_SIZE, ORB_BUSY_SPEED, ORB_COLOR, ORB_DOT_SIZE, ORB_IDLE_SPEED, sendAssistantMessage, setAssistantOpen, useAssistantChat, useAssistantOpen } from './assistantStore';

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
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [nudgesOff, setNudgesOff] = useState(false);

  // While the window is closed, float a small suggestion beside the orb every so often so people
  // notice Del is there. It hides itself after a few seconds and stops for the tab once dismissed twice.
  useEffect(() => {
    if (open || loading || onAssistantPage || nudgesOff) return;
    let dismissed = 0;
    try { dismissed = Number(window.sessionStorage.getItem('assistant_nudge_dismissed') || 0); } catch { /* ignore */ }
    if (dismissed >= 2) return;
    let hide: ReturnType<typeof setTimeout>;
    let next: ReturnType<typeof setTimeout>;
    const show = () => {
      const pool = nudgePool();
      setNudge(pool[Math.floor(Math.random() * pool.length)]);
      hide = setTimeout(() => setNudge(null), 9000);
      next = setTimeout(show, 50_000 + Math.random() * 40_000);
    };
    next = setTimeout(show, 6000 + Math.random() * 6000);
    return () => { clearTimeout(hide); clearTimeout(next); setNudge(null); };
  }, [open, loading, onAssistantPage, nudgesOff]);

  const dismissNudge = () => {
    setNudge(null);
    try {
      const count = Number(window.sessionStorage.getItem('assistant_nudge_dismissed') || 0) + 1;
      window.sessionStorage.setItem('assistant_nudge_dismissed', String(count));
      if (count >= 2) setNudgesOff(true); // stops the schedule straight away, not only after a reload
    } catch { /* ignore */ }
  };

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
          className="fixed bottom-[11rem] right-4 z-[45] h-[560px] max-h-[calc(100vh-13rem)] w-[420px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 shadow-2xl md:bottom-24 md:right-6 md:max-h-[70vh]"
        >
          <ChatPanel
            variant="window"
            role={role}
            onClose={() => { setAssistantOpen(false); buttonRef.current?.focus(); }}
            onExpand={() => { setAssistantOpen(false); router.push(`/${role}/assistant`); }}
          />
        </div>
      )}
      {nudge && !open && !loading && !onAssistantPage && (
        <div className="fixed bottom-[7.5rem] right-24 z-[45] flex max-w-[15rem] items-center gap-1 rounded-2xl rounded-br-sm border border-orange-200 bg-white py-1 pl-3 pr-1 text-sm text-slate-800 shadow-lg md:bottom-9 md:right-28">
          <button
            type="button"
            onClick={() => { const q = nudge.question; setNudge(null); setAssistantOpen(true); void sendAssistantMessage(q); }}
            className="py-1 text-left font-medium hover:text-orange-700"
          >
            {nudge.bubble}
          </button>
          <button type="button" onClick={dismissNudge} aria-label="Dismiss suggestion" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600">×</button>
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
