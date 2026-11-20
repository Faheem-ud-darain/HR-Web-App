// Listens for the ways the app goes wrong on a person's device and sends a report for each new kind of problem, so HR sees what
// employees run into without anyone having to describe it. Each problem is sent at most once every ten minutes and the page
// stops after a handful, so a loop of errors can never flood the database.
import { addCrumb, recentNoReplyCount, recordFailure } from './breadcrumbs';
import { deliver, flushPendingReports, buildReport, type ReportInput } from './send';
import { fingerprintOf, hostAndPath, isNoise, scrub } from './sanitize';

const SAME_PROBLEM_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_AUTO_REPORTS_PER_PAGE = 12;
const NETWORK_TROUBLE_FAILURES = 3;
const NETWORK_TROUBLE_WINDOW_MS = 2 * 60 * 1000;
const NETWORK_REPORT_COOLDOWN_MS = 30 * 60 * 1000;

const lastSent = new Map<string, number>();
let autoSent = 0;

/** Sends an automatic report unless the same problem was just sent or the page has already sent its share. */
export async function reportAutomatically(input: ReportInput): Promise<void> {
  if (autoSent >= MAX_AUTO_REPORTS_PER_PAGE) return;
  const key = fingerprintOf(input.kind, input.message ?? input.title, typeof window !== 'undefined' ? hostAndPath(window.location.href) : '');
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < SAME_PROBLEM_COOLDOWN_MS) return;
  lastSent.set(key, now);
  autoSent += 1;
  try { await deliver(await buildReport(input)); } catch { /* reporting must never cause a problem of its own */ }
}

/** The error boundary calls this when a screen crashes. */
export function reportCrash(error: Error & { digest?: string }, boundary: string): void {
  void reportAutomatically({
    kind: 'crash',
    title: `Screen crashed: ${scrub(error?.message || 'unknown error', 120)}`,
    message: error?.message || 'unknown error',
    stack: error?.stack,
    extra: { boundary, digest: error?.digest || '', errorName: error?.name || '' },
  });
}

let installed = false;

export function installIssueCapture(): () => void {
  if (installed || typeof window === 'undefined') return () => {};
  installed = true;
  const cleanups: (() => void)[] = [];
  const listen = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) => {
    window.addEventListener(type, fn as EventListener);
    cleanups.push(() => window.removeEventListener(type, fn as EventListener));
  };

  addCrumb('page', `opened ${hostAndPath(window.location.href)}`);

  // Page changes (the app navigates without reloading, so listen to the history API as well as the back button).
  const { pushState } = window.history;
  const noteRoute = () => addCrumb('page', `opened ${window.location.pathname}`);
  window.history.pushState = function (...args) { const r = pushState.apply(this, args); noteRoute(); return r; };
  cleanups.push(() => { window.history.pushState = pushState; });
  listen('popstate', noteRoute);

  listen('online', () => { addCrumb('network', 'connection came back'); void flushPendingReports(); });
  listen('offline', () => addCrumb('network', 'connection lost'));

  listen('error', (e: ErrorEvent) => {
    const message = e.message || (e.error as Error | undefined)?.message || 'Unknown error';
    if (isNoise(message, e.filename)) return;
    addCrumb('error', message);
    void reportAutomatically({
      kind: 'error',
      title: scrub(message, 160),
      message,
      stack: (e.error as Error | undefined)?.stack || `${e.filename || ''}:${e.lineno || 0}:${e.colno || 0}`,
    });
  });

  listen('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason as Error | string | undefined;
    const message = typeof reason === 'string' ? reason : reason?.message || 'Unhandled promise rejection';
    if (isNoise(message)) return;
    addCrumb('error', message);
    void reportAutomatically({
      kind: 'error',
      title: scrub(`Unhandled: ${message}`, 160),
      message,
      stack: typeof reason === 'object' ? reason?.stack : undefined,
    });
  });

  // The browser refusing something our own security rules forbid (a blocked script or request) is invisible to the person but fatal to a feature.
  listen('securitypolicyviolation', (e: SecurityPolicyViolationEvent) => {
    const message = `Blocked by security policy: ${e.violatedDirective} ${hostAndPath(e.blockedURI || '')}`;
    addCrumb('error', message);
    void reportAutomatically({ kind: 'error', title: scrub(message, 160), message });
  });

  // Watch our own requests: remember failures, and report when several in a row got no reply at all (the person cannot reach a server).
  const originalFetch = window.fetch;
  let lastNetworkReport = 0;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    const started = Date.now();
    try {
      const res = await originalFetch.call(window, input, init);
      if (res.status >= 400) {
        recordFailure(url, 'http', res.status);
        addCrumb('request', `${method} ${hostAndPath(url)} → ${res.status} (${Date.now() - started} ms)`);
      }
      return res;
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        recordFailure(url, 'network');
        addCrumb('request', `${method} ${hostAndPath(url)} → no reply: ${scrub((err as Error)?.message, 80)} (${Date.now() - started} ms)`);
        const now = Date.now();
        if (recentNoReplyCount(NETWORK_TROUBLE_WINDOW_MS) >= NETWORK_TROUBLE_FAILURES && now - lastNetworkReport > NETWORK_REPORT_COOLDOWN_MS) {
          lastNetworkReport = now;
          void reportAutomatically({
            kind: 'network',
            title: 'Cannot reach our servers (several requests got no reply)',
            message: `${NETWORK_TROUBLE_FAILURES}+ requests in a row got no reply; last: ${method} ${hostAndPath(url)}`,
          });
        }
      }
      throw err;
    }
  };
  cleanups.push(() => { window.fetch = originalFetch; });

  void flushPendingReports();
  const retry = window.setInterval(() => void flushPendingReports(), 5 * 60 * 1000);
  cleanups.push(() => window.clearInterval(retry));

  return () => { cleanups.forEach(fn => fn()); installed = false; };
}
