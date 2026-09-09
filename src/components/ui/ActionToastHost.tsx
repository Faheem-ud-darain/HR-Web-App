'use client';

// Shared "your action succeeded/failed" toast primitive — plan 009.
//
// Deliberately named ActionToastHost/useActionToast, NOT Toast/useToast, to
// stay unambiguous from ToastNotification.tsx (a completely different
// feature: a real-time notification-bell alert subscribed to the
// hr_notifications PocketBase collection, not a generic message channel —
// see that file's own comment). The two must never be merged or confused.
//
// Before this, 12 files each rolled their own local success/error banner
// (useState + setTimeout + inline JSX rendered near the top of that page's
// content) with inconsistent auto-dismiss timing and, on long pages, a
// banner easily scrolled out of view from whatever row/button the user just
// acted on. This renders instead as a small, auto-dismissing toast fixed to
// the top-center of the viewport — visible regardless of scroll position —
// and reuses this app's existing emerald/rose success/error color language
// rather than inventing a new visual style.
//
// Positioned top-CENTER rather than top-right to avoid colliding with
// ToastNotification's own top-right corner (both can be visible at once —
// they are unrelated queues, not a shared one), and top rather than bottom
// to stay clear of the mobile floating bottom nav (Sidebar.tsx) and the
// bottom-anchored composer on Tickets/Chat screens (see
// (dashboard)/layout.tsx's isTicketsScreen/isChatScreen handling).
//
// Auto-dismiss timing matches this codebase's own most common existing
// values rather than an invented number: 1500ms was the most common
// success-banner timeout across the 12 migrated files, 3000ms the most
// common error-banner timeout — kept as two different durations (errors
// get more time to read) rather than forcing one universal number.

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

type ActionToastType = 'success' | 'error';

interface ActionToast {
  id: string;
  type: ActionToastType;
  message: string;
  visible: boolean;
}

interface ShowToastArgs {
  type: ActionToastType;
  message: string;
}

interface ActionToastContextValue {
  showToast: (args: ShowToastArgs) => void;
}

const ActionToastContext = createContext<ActionToastContextValue | null>(null);

const SUCCESS_DISMISS_MS = 1500;
const ERROR_DISMISS_MS = 3000;
const FADE_MS = 300;

export function useActionToast(): ActionToastContextValue {
  const ctx = useContext(ActionToastContext);
  if (!ctx) {
    throw new Error('useActionToast() must be called from a component mounted under <ActionToastHost>.');
  }
  return ctx;
}

export function ActionToastHost({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ActionToast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback(({ type, message }: ShowToastArgs) => {
    const id = `action-toast-${Date.now()}-${nextId.current++}`;
    setToasts(prev => [...prev, { id, type, message, visible: true }]);

    const dismissMs = type === 'success' ? SUCCESS_DISMISS_MS : ERROR_DISMISS_MS;
    setTimeout(() => {
      setToasts(prev => prev.map(t => (t.id === id ? { ...t, visible: false } : t)));
    }, dismissMs);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, dismissMs + FADE_MS);
  }, []);

  return (
    <ActionToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[var(--z-toast)] w-[calc(100%-2rem)] sm:w-auto sm:min-w-[280px] max-w-[420px] space-y-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto border shadow-lg rounded-xl px-3.5 py-2.5 flex items-center gap-2 transition-[transform,opacity] duration-300 transform motion-reduce:transition-none motion-reduce:transform-none ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            } ${toast.visible ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-2 opacity-0 scale-95'}`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span className="text-xs font-semibold leading-relaxed flex-1">{toast.message}</span>
            <button
              onClick={() => dismiss(toast.id)}
              className="text-current opacity-60 hover:opacity-100 shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ActionToastContext.Provider>
  );
}
