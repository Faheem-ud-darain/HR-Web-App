// Builds a problem report and sends it straight to the database (pb.delcargo.us), NOT through the portal host: the cases we most
// need to hear about are the ones where the portal itself cannot be reached. A report that cannot be delivered is kept on the
// device and retried when the connection returns.
import { PB_URL } from '@/lib/pbUrl';
import { addCrumb } from './breadcrumbs';
import { BUILD_ID, collectContext, probeReachability, sendFetch } from './context';
import { fingerprintOf, scrub } from './sanitize';

export type ReportKind = 'crash' | 'error' | 'network' | 'manual';

export interface ReportInput {
  kind: ReportKind;
  title: string;
  message?: string;
  stack?: string;
  /** What the person typed ("I pressed Absence Records and it said…"). */
  note?: string;
  /** Anything else worth keeping, e.g. the error boundary's digest. */
  extra?: Record<string, unknown>;
}

export interface StoredReport {
  client_id: string;
  kind: ReportKind;
  title: string;
  message: string;
  stack: string;
  note: string;
  route: string;
  email: string;
  role: string;
  build_id: string;
  fingerprint: string;
  status: 'new';
  occurred_at: string;
  context: Record<string, unknown>;
}

const QUEUE_KEY = 'delcargo_pending_reports';
const MAX_QUEUED = 15;
const MAX_REPORT_CHARS = 24000; // PocketBase json fields are capped too; stay well under

export function newClientId(): string {
  const bytes = new Uint8Array(12);
  (globalThis.crypto || { getRandomValues: (a: Uint8Array) => a.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function buildReport(input: ReportInput, withProbe = true): Promise<StoredReport> {
  const context = collectContext();
  if (withProbe) context.reachability = await probeReachability();
  if (input.extra) context.extra = Object.fromEntries(Object.entries(input.extra).map(([k, v]) => [k, scrub(v, 300)]));
  const route = String(context.page || '');
  const message = scrub(input.message ?? input.title, 1500);
  let report: StoredReport = {
    client_id: newClientId(),
    kind: input.kind,
    title: scrub(input.title, 200),
    message,
    stack: scrub(input.stack, 5000),
    note: scrub(input.note, 2000),
    route: scrub(route, 300),
    email: String(context.email || ''),
    role: String(context.role || ''),
    build_id: BUILD_ID,
    fingerprint: fingerprintOf(input.kind, message || input.title, route),
    status: 'new',
    occurred_at: new Date().toISOString(),
    context,
  };
  // Over the size cap: drop the bulkiest optional parts, never the report itself.
  if (JSON.stringify(report).length > MAX_REPORT_CHARS) {
    const { recentSteps, ...rest } = report.context as Record<string, unknown>;
    report = { ...report, stack: report.stack.slice(0, 1500), context: { ...rest, recentSteps: Array.isArray(recentSteps) ? recentSteps.slice(-12) : [] } };
  }
  return report;
}

async function post(report: StoredReport): Promise<'sent' | 'rejected' | 'failed'> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await sendFetch(`${PB_URL}/api/collections/hr_issue_reports/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      signal: controller.signal,
    });
    if (res.ok) return 'sent';
    // A 4xx means the database refused this report for good (a retry would only repeat it); a 5xx is worth trying again.
    // A "duplicate client_id" answer means an earlier attempt did get through.
    return res.status >= 400 && res.status < 500 ? 'rejected' : 'failed';
  } catch {
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

function readQueue(): StoredReport[] {
  try { return JSON.parse(window.localStorage.getItem(QUEUE_KEY) || '[]') as StoredReport[]; } catch { return []; }
}
function writeQueue(items: StoredReport[]): void {
  try { window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUED))); } catch { /* storage full or blocked: nothing more to do */ }
}

/** Sends the report; if it cannot be delivered it is kept and retried later. Resolves to whether it reached the database. */
export async function deliver(report: StoredReport): Promise<boolean> {
  const result = await post(report);
  if (result === 'failed') {
    writeQueue([...readQueue().filter(r => r.client_id !== report.client_id), report]);
    addCrumb('note', 'a problem report could not be sent and was kept for later');
    return false;
  }
  return result === 'sent';
}

let flushing = false;
/** Tries every report kept on this device. Safe to call often. */
export async function flushPendingReports(): Promise<void> {
  if (flushing || typeof window === 'undefined') return;
  const queued = readQueue();
  if (queued.length === 0) return;
  flushing = true;
  try {
    const remaining: StoredReport[] = [];
    for (const report of queued) {
      if ((await post(report)) === 'failed') remaining.push(report);
    }
    writeQueue(remaining);
  } finally {
    flushing = false;
  }
}

export async function submitReport(input: ReportInput): Promise<boolean> {
  return deliver(await buildReport(input));
}
