'use client';

import { useSyncExternalStore } from 'react';

// The phone's menu button lives in the top bar while the menu itself lives with the navigation, so the two share
// this tiny store: whether the menu is open, and whether any page in it has new activity (shown as a dot on the button).
interface State { open: boolean; dot: boolean }
let state: State = { open: false, dot: false };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const setMobileNavOpen = (open: boolean) => set({ open });
export const setMobileNavDot = (dot: boolean) => { if (dot !== state.dot) set({ dot }); };

export const useMobileNavOpen = () => useSyncExternalStore(subscribe, () => state.open, () => false);
export const useMobileNavDot = () => useSyncExternalStore(subscribe, () => state.dot, () => false);
