// A short rolling diary of what the page did just before something went wrong: pages opened, requests that failed,
// the connection dropping. It lives in memory only and is attached to a report when one is sent.
import { hostOf, scrub } from './sanitize';

export interface Crumb { at: string; type: 'page' | 'request' | 'network' | 'error' | 'note'; text: string }

const MAX_CRUMBS = 40;
let crumbs: Crumb[] = [];

export function addCrumb(type: Crumb['type'], text: string): void {
  crumbs.push({ at: new Date().toISOString(), type, text: scrub(text, 240) });
  if (crumbs.length > MAX_CRUMBS) crumbs = crumbs.slice(-MAX_CRUMBS);
}

export const getCrumbs = (): Crumb[] => crumbs.slice();
export const clearCrumbs = (): void => { crumbs = []; };

// Failed requests in the last few minutes, per host: the clearest sign of "this person's connection to one of our servers is broken".
const FAILURE_WINDOW_MS = 5 * 60 * 1000;
let failures: { at: number; host: string; kind: 'network' | 'http'; status?: number }[] = [];

export function recordFailure(url: string, kind: 'network' | 'http', status?: number, now = Date.now()): void {
  const host = hostOf(url) || 'unknown';
  failures = failures.filter(f => now - f.at < FAILURE_WINDOW_MS);
  failures.push({ at: now, host, kind, status });
}

/** Failures per host in the last five minutes, and how many of them never got any reply at all. */
export function failureSummary(now = Date.now()): Record<string, { total: number; noReply: number; statuses: number[] }> {
  const out: Record<string, { total: number; noReply: number; statuses: number[] }> = {};
  for (const f of failures) {
    if (now - f.at >= FAILURE_WINDOW_MS) continue;
    const row = (out[f.host] ||= { total: 0, noReply: 0, statuses: [] });
    row.total += 1;
    if (f.kind === 'network') row.noReply += 1;
    else if (f.status && !row.statuses.includes(f.status)) row.statuses.push(f.status);
  }
  return out;
}

/** Number of requests in the last `windowMs` that got no reply at all (the page could not reach the server). */
export function recentNoReplyCount(windowMs: number, now = Date.now()): number {
  return failures.filter(f => f.kind === 'network' && now - f.at < windowMs).length;
}

export const clearFailures = (): void => { failures = []; };
