'use client';

import { useSyncExternalStore } from 'react';
import { THEME_KEY } from './themeBoot';

// Appearance, the way iOS offers it: Automatic (follow the device), Light, or Dark. The choice is kept in
// this browser/app only. `data-theme` on <html> is what the stylesheet (globals.css) reacts to.
export type ThemePreference = 'system' | 'light' | 'dark';
const CHANGE_EVENT = 'dc-theme-change';

export function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return pref;
}

function applyTheme(pref: ThemePreference) {
  const theme = resolveTheme(pref);
  document.documentElement.setAttribute('data-theme', theme);
  // Browser chrome / installed-app title bar follows the page.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#000000' : '#0B0F1A');
  // Native app: light icons on a dark screen and the other way round (no-op on the web).
  import('@capacitor/status-bar')
    .then(({ StatusBar, Style }) => StatusBar.setStyle({ style: theme === 'dark' ? Style.Light : Style.Dark }))
    .catch(() => { /* web, or plugin not in this build */ });
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch { /* private mode: the choice lasts until the page is closed */ }
  applyTheme(pref);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  // "Automatic" follows the device live: switching the phone to dark at sunset flips the app too.
  const onSystem = () => { if (readPreference() === 'system') applyTheme('system'); onChange(); };
  mq.addEventListener('change', onSystem);
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    mq.removeEventListener('change', onSystem);
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, readPreference, () => 'system');
}

// What is actually showing right now (resolves "system").
export function useResolvedTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'),
    () => 'light',
  );
}
