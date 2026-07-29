'use client';

import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, X, ShieldAlert } from 'lucide-react';
import { pb } from '@/lib/pocketbase';
import { getSessionEmail, getSessionRole } from '@/lib/session';

interface ToastMsg {
  id: string;
  message: string;
  timestamp: string;
  visible: boolean;
}

export function ToastNotification() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    let unsubscribed = false;

    // subscribe() returns a Promise that rejects if the initial realtime
    // (SSE) handshake fails or times out — this app's web deploy proxies
    // PocketBase through a Next.js rewrite (see next.config.ts), and that
    // proxy doesn't always keep a long-lived EventSource connection alive,
    // especially on first load. Uncaught, that rejection surfaced as a
    // full "Runtime ClientResponseError" crash overlay. It's caught here
    // instead: the toast/push feature just silently stays unavailable
    // (notifications still show up via TopNav's normal 15s polling) rather
    // than breaking the page. PocketBase's SDK retries the connection with
    // its own backoff in the background, so this can recover on its own.
    pb.collection('hr_notifications').subscribe('*', function (e) {
      if (unsubscribed) return;
      if (e.action === 'create') {
        const notif = e.record;

        // This subscription already gets every new notification in real
        // time — piggyback on it to invalidate the bell's query cache too,
        // instead of leaving TopNav's unread count/list stuck at whatever it
        // was when the layout first mounted (previously only a page reload
        // or the 15s polling backstop would pick this up).
        queryClient.invalidateQueries({ queryKey: ['hr_notifications'] });

        const savedRole = getSessionRole();
        const savedEmail = getSessionEmail();
        const isForMe =
          notif.recipient_email === savedEmail ||
          (notif.recipient_role === savedRole && notif.recipient_email === 'all');
        if (!isForMe) return;

        const newToast: ToastMsg = {
          id: notif.id,
          message: notif.message,
          timestamp: notif.created,
          visible: true
        };

        setToasts(prev => [...prev, newToast]);

        // Auto fade out after 4 seconds
        setTimeout(() => {
          setToasts(prev => prev.map(t => t.id === notif.id ? { ...t, visible: false } : t));
        }, 4000);

        // Remove from state array completely after fade transition completes
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== notif.id));
        }, 4500);
      }
    }).catch(err => {
      console.error('[ToastNotification] realtime subscribe failed (will keep retrying in the background):', err);
    });

    return () => {
      unsubscribed = true;
      pb.collection('hr_notifications').unsubscribe('*').catch(() => {
        // Nothing to clean up if the subscription never actually connected.
      });
    };
  }, []);

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="fixed top-5 left-4 right-4 sm:left-auto sm:right-5 sm:w-[340px] z-[var(--z-toast)] space-y-3 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          // transition-[transform,opacity], not transition-all — only
          // those two properties change between the visible/hidden states
          // below; scoping it keeps this off any other property (e.g.
          // shadow/border) that isn't meant to be watched.
          className={`pointer-events-auto bg-white/90 backdrop-blur-md border border-slate-200 shadow-xl rounded-xl p-4 flex gap-3 items-start transition-[transform,opacity] duration-300 transform motion-reduce:transition-none motion-reduce:transform-none ${
            toast.visible 
              ? 'translate-y-0 sm:translate-x-0 opacity-100 scale-100' 
              : 'translate-y-[-12px] sm:translate-x-12 opacity-0 scale-95'
          }`}
        >
          <div className="h-8 w-8 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 shrink-0">
            <Bell className="h-4 w-4 animate-bounce" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">New Push Alert</p>
            <p className="text-xs font-semibold text-slate-800 mt-1 leading-relaxed whitespace-pre-wrap break-words">{toast.message}</p>
            <span className="text-[9px] text-slate-400 block mt-1.5 font-medium">{toast.timestamp}</span>
          </div>

          <button
            onClick={() => dismissToast(toast.id)}
            className="text-slate-400 hover:text-slate-600 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
