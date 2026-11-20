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
    // A blocked-by-policy message names what was blocked, not where: the same block on every page is one problem.
    fingerprint: fingerprintOf(input.kind, message || input.title, /^blocked by security policy/i.test(message) ? '' : route),
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

type PostResult = 'sent' | 'rejected' | 'failed';

async function post(report: StoredReport): Promise<PostResult> {
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
    if (res.status >= 400 && res.status < 500) {
      // "client_id is not unique" means an earlier attempt did get through (only its answer was lost): that report is delivered.
      const body = await res.json().catch(() => null) as { data?: { client_id?: { code?: string } } } | null;
      return body?.data?.client_id?.code === 'validation_not_unique' ? 'sent' : 'rejected';
    }
    return 'failed'; // a 5xx is worth trying again later
  } catch {
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

function readQueue(): StoredReport[] {
  try { return JSON.parse(window.localStorage.getItem(QUEUE_KEY) || '[]') as StoredReport[]; } catch { return []; }
}
/** False when the device refused to store the queue (storage full or blocked). */
function writeQueue(items: StoredReport[]): boolean {
  try { window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUED))); return true; } catch { return false; }
}

/** The kept reports after a flush: everything now in the queue except those the flush finished with. Reports added during the flush stay. */
export function reconcileQueue(latest: StoredReport[], finishedIds: Set<string>): StoredReport[] {
  return latest.filter(r => !finishedIds.has(r.client_id));
}

/**
 * 'sent'     reached the database.
 * 'queued'   could not be sent now; kept on this device and retried later.
 * 'rejected' the database refused it for good (a retry would only repeat that).
 * 'lost'     could not be sent and the device would not keep it either.
 */
export type DeliveryResult = 'sent' | 'queued' | 'rejected' | 'lost';

export async function deliver(report: StoredReport): Promise<DeliveryResult> {
  const result = await post(report);
  if (result === 'sent') return 'sent';
  if (result === 'rejected') return 'rejected';
  if (!writeQueue([...readQueue().filter(r => r.client_id !== report.client_id), report])) return 'lost';
  addCrumb('note', 'a problem report could not be sent and was kept for later');
  return 'queued';
}

let flushing = false;
/** Tries every report kept on this device. Safe to call often. */
export async function flushPendingReports(): Promise<void> {
  if (flushing || typeof window === 'undefined') return;
  const snapshot = readQueue();
  if (snapshot.length === 0) return;
  flushing = true;
  try {
    const finished = new Set<string>();
    for (const report of snapshot) {
      if ((await post(report)) !== 'failed') finished.add(report.client_id);
    }
    // Re-read the queue now: a report may have been added while the sends were in flight, and must not be overwritten.
    writeQueue(reconcileQueue(readQueue(), finished));
  } finally {
    flushing = false;
  }
}

export async function submitReport(input: ReportInput): Promise<DeliveryResult> {
  return deliver(await buildReport(input));
}
