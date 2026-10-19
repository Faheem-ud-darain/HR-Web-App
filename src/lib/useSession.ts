'use client';
import { useSyncExternalStore } from 'react';
import { getSessionEmail, getSessionRole } from './session';

// The session lives in localStorage, which only exists in the browser, so
// components used to copy it into state inside an effect after mounting. These
// hooks read it directly instead (React's external-store hook): null on the
// server and during hydration, the real value in the browser, and they update
// when the session changes in this tab (SESSION_CHANGED_EVENT, fired by
// session.ts) or in another one (the `storage` event).
export const SESSION_CHANGED_EVENT = 'hr-session-changed';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(SESSION_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(SESSION_CHANGED_EVENT, onChange);
  };
}

export function useSessionEmail(): string | null {
  return useSyncExternalStore(subscribe, getSessionEmail, () => null);
}

export function useSessionRole(): string | null {
  return useSyncExternalStore(subscribe, getSessionRole, () => null);
}
