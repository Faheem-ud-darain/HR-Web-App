'use client';
import { useSyncExternalStore } from 'react';

// A shared wall clock for render code that needs "the current time" (due dates,
// how long a shift has been open, whether a maintenance window has ended).
// Calling Date.now() while rendering is impure — the value differs on every call
// and React can't know when to re-render — so components read the time from here
// instead: one timer (shared by every user of the hook) refreshes it every 30s and
// re-renders subscribers. It is 0 on the server and during hydration, so callers
// treat 0 as "time not known yet".
const TICK_MS = 30_000;
const listeners = new Set<() => void>();
let current = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (!timer) {
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      listeners.forEach(listener => listener());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer) { clearInterval(timer); timer = null; }
  };
}

function getSnapshot(): number {
  if (current === 0) current = Date.now();
  return current;
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
