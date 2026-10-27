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

// Where the circle starts/ends: the centre of the control that was tapped.
export type WipeOrigin = { x: number; y: number };
export const originOf = (el: Element): WipeOrigin => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

function commit(pref: ThemePreference) {
  applyTheme(pref);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

let activeWipe: ViewTransition | null = null;
// Numbers each wipe. A skipped transition still runs its update callback later, so the callback only applies
// its theme while it is the latest wipe: otherwise it could undo a newer choice.
let wipeId = 0;

function clearWipe() {
  const root = document.documentElement;
  root.removeAttribute('data-theme-wipe');
  root.style.removeProperty('--wipe-x');
  root.style.removeProperty('--wipe-y');
}

// Switching to dark paints a circle out of the toggle over the screen; switching back to light pulls the
// dark screen into the toggle. Uses the View Transitions API, so browsers without it (or people who ask for
// reduced motion) just get the instant switch. A click while a wipe is still running ends it and switches
// at once, so tapping quickly can never stack transitions.
export function setThemePreference(pref: ThemePreference, origin?: WipeOrigin) {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch { /* private mode: the choice lasts until the page is closed */ }

  const root = document.documentElement;
  const toDark = resolveTheme(pref) === 'dark';
  const changes = toDark !== (root.getAttribute('data-theme') === 'dark');
  if (activeWipe) {
    wipeId++;
    activeWipe.skipTransition();
    activeWipe = null;
    clearWipe();
    commit(pref);
    return;
  }
  if (!origin || !changes || !document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    commit(pref);
    return;
  }

  // The start circle is also set in CSS (globals.css) so the new screen is never visible full-size before the
  // animation below is attached.
  root.style.setProperty('--wipe-x', `${origin.x}px`);
  root.style.setProperty('--wipe-y', `${origin.y}px`);
  root.setAttribute('data-theme-wipe', toDark ? 'grow' : 'shrink');
  const id = ++wipeId;
  const transition = document.startViewTransition(() => { if (id === wipeId) commit(pref); });
  activeWipe = transition;
  const radius = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y));
  const circle = (r: number) => `circle(${r}px at ${origin.x}px ${origin.y}px)`;
  transition.ready
    .then(() => root.animate(
      { clipPath: toDark ? [circle(0), circle(radius)] : [circle(radius), circle(0)] },
      { duration: 550, easing: 'ease-in-out', fill: 'forwards', pseudoElement: toDark ? '::view-transition-new(root)' : '::view-transition-old(root)' },
    ))
    .catch(() => { /* transition skipped */ });
  transition.finished.catch(() => { /* skipped or interrupted */ }).finally(() => {
    if (activeWipe === transition) { activeWipe = null; clearWipe(); }
  });
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
