// What we know about the person's device and connection at the moment of a problem, collected in the browser.
import { getSessionEmail, getSessionRole } from '@/lib/session';
import { DEFAULT_PB_URL } from '@/lib/pbUrl';
import { APP_VERSIONS } from '@/lib/appVersion';
import { failureSummary, getCrumbs } from './breadcrumbs';
import { hostAndPath, scrub } from './sanitize';

export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || 'unknown';

// The browser's own fetch, taken before the page's request watcher wraps it, so reports and probes are never counted as the app's own failures.
const nativeFetch: typeof fetch | null = typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
export const sendFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  if (!nativeFetch) return Promise.reject(new Error('fetch unavailable'));
  return nativeFetch(input, init);
};

// A small static file on the portal host. NEVER /reset.html: that page answers with Clear-Site-Data, so fetching it makes the browser wipe the
// saved login and signs the person out.
export const PORTAL_PROBE_PATH = '/manifest.webmanifest';

interface Probe { ok: boolean; ms: number; status?: number; error?: string }

async function probe(url: string, timeoutMs = 6000): Promise<Probe> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await sendFetch(url, { cache: 'no-store', signal: controller.signal });
    return { ok: res.ok, ms: Date.now() - started, status: res.status };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: controller.signal.aborted ? 'timed out' : scrub((err as Error)?.name || 'network error', 60) };
  } finally {
    clearTimeout(timer);
  }
}

/** Can this device reach the portal and the database right now, and how fast? Shows at a glance which side is broken. */
export async function probeReachability(): Promise<{ portal: Probe; database: Probe }> {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const [portal, database] = await Promise.all([probe(`${origin}${PORTAL_PROBE_PATH}?probe=${Date.now()}`), probe(`${DEFAULT_PB_URL}/api/health`)]);
  return { portal, database };
}

// Reading the session touches browser storage, which can throw (blocked storage, private mode): a report must still be built then.
const safely = (read: () => string | null): string => { try { return read() || ''; } catch { return ''; } };

interface NetworkInfo { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean }

export function collectContext(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  const nav = navigator as Navigator & { connection?: NetworkInfo; deviceMemory?: number; standalone?: boolean };
  const perf = performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } };
  const timing = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const conn = nav.connection;
  let storageOk = true;
  try { window.localStorage.setItem('__t', '1'); window.localStorage.removeItem('__t'); } catch { storageOk = false; }
  return {
    page: hostAndPath(window.location.href),
    referrer: window.document.referrer ? hostAndPath(window.document.referrer) : '',
    appVersion: APP_VERSIONS.web,
    buildId: BUILD_ID,
    email: safely(getSessionEmail),
    role: safely(getSessionRole),
    userAgent: scrub(nav.userAgent, 300),
    platform: scrub(nav.platform, 60),
    language: nav.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    utcOffsetMin: -new Date().getTimezoneOffset(),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio}`,
    online: nav.onLine,
    connection: conn ? { type: conn.effectiveType, downlinkMbps: conn.downlink, rttMs: conn.rtt, saveData: conn.saveData } : null,
    visibility: document.visibilityState,
    cookiesEnabled: nav.cookieEnabled,
    storageOk,
    standalone: window.matchMedia('(display-mode: standalone)').matches || Boolean(nav.standalone),
    deviceMemoryGb: nav.deviceMemory,
    heapUsedMb: perf.memory ? Math.round(perf.memory.usedJSHeapSize / 1048576) : undefined,
    heapLimitMb: perf.memory ? Math.round(perf.memory.jsHeapSizeLimit / 1048576) : undefined,
    tabOpenForMin: Math.round(performance.now() / 60000),
    pageLoadMs: timing ? Math.round(timing.loadEventEnd || timing.domComplete || 0) : undefined,
    failedRequests5min: failureSummary(),
    recentSteps: getCrumbs(),
  };
}
