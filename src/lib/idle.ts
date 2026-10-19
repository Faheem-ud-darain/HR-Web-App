// Idle-aware polling helpers.
//
// Background polls (notifications, tickets, messages, typing, ...) exist so the
// screen feels live for someone who is LOOKING at it. After IDLE_AFTER_MS with
// no mouse/keyboard/touch/scroll input the person has stepped away (or is
// working in another app with this tab still open), so every poll that uses
// these helpers runs IDLE_FACTOR times slower until they come back. Tabs that
// are hidden are already paused (react-query's refetchIntervalInBackground is
// off; setAdaptiveInterval below skips ticks while hidden).
//
// Plain TypeScript; browser listeners are only installed on first use.

export const IDLE_AFTER_MS = 2 * 60 * 1000;
export const IDLE_FACTOR = 3;

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel', 'click'] as const;

let lastActivityAt = Date.now();
let installed = false;
const resumeListeners = new Set<() => void>();

function markActive() {
  const wasIdle = Date.now() - lastActivityAt >= IDLE_AFTER_MS;
  lastActivityAt = Date.now();
  if (wasIdle) resumeListeners.forEach(fn => { try { fn(); } catch { /* a listener must not break input handling */ } });
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  lastActivityAt = Date.now();
  for (const evt of ACTIVITY_EVENTS) window.addEventListener(evt, markActive, { passive: true, capture: true });
}

export function isUserIdle(now: number = Date.now()): boolean {
  install();
  return now - lastActivityAt >= IDLE_AFTER_MS;
}

/** The factor to multiply a polling interval by right now (1 while active). */
export function idleFactor(now: number = Date.now()): number {
  return isUserIdle(now) ? IDLE_FACTOR : 1;
}

/**
 * For react-query: `refetchInterval: every(30_000)`. React Query re-evaluates
 * the function after each fetch, so the pace follows the current idle state.
 */
export function every(baseMs: number): () => number {
  return () => baseMs * idleFactor();
}

/** Runs `callback` once the person returns from an idle period (first input after it). Returns an unsubscribe. */
export function onResumeFromIdle(callback: () => void): () => void {
  install();
  resumeListeners.add(callback);
  return () => { resumeListeners.delete(callback); };
}

/**
 * setInterval replacement for hand-rolled polls: the next tick is scheduled
 * `baseMs` (x IDLE_FACTOR while idle) after the previous one, ticks while the
 * tab is hidden are skipped, and the returned function cancels it.
 * `intervalFor` can override the base per tick (e.g. a quiet-channel backoff).
 */
export function setAdaptiveInterval(
  callback: () => void,
  baseMs: number | (() => number),
  options: { skipWhenHidden?: boolean } = {},
): () => void {
  const { skipWhenHidden = true } = options;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const next = () => {
    if (stopped) return;
    const base = typeof baseMs === 'function' ? baseMs() : baseMs;
    timer = setTimeout(() => {
      if (stopped) return;
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      if (!(skipWhenHidden && hidden)) callback();
      next();
    }, base * idleFactor());
  };
  next();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

/** Test hook: pretend the last input happened at `timestamp`. */
export function __setLastActivityForTests(timestamp: number): void {
  lastActivityAt = timestamp;
  installed = true;
}
