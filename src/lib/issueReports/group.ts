// Turns the raw list of reports into what HR actually needs: one line per problem, who it affects, and a plain-words guess at the cause.
export interface IssueReport {
  id: string;
  created: string;
  occurred_at?: string;
  kind: 'crash' | 'error' | 'network' | 'manual';
  title: string;
  message: string;
  stack?: string;
  note?: string;
  route?: string;
  email?: string;
  role?: string;
  build_id?: string;
  fingerprint: string;
  status: 'new' | 'seen' | 'resolved';
  admin_note?: string;
  context?: Record<string, unknown>;
}

export interface IssueGroup {
  fingerprint: string;
  title: string;
  kind: IssueReport['kind'];
  count: number;
  people: string[];
  lastSeen: string;
  firstSeen: string;
  status: IssueReport['status'];
  hint: string;
  reports: IssueReport[]; // newest first
}

interface Probe { ok?: boolean; ms?: number; status?: number; error?: string }
const asProbe = (v: unknown): Probe | null => (v && typeof v === 'object' ? (v as Probe) : null);

export interface Step { at: string; type: string; text: string }
/** The report's "recent steps", keeping only well-formed entries: reports can be added by anyone, so never trust their shape. */
export function recentSteps(context: Record<string, unknown> | undefined): Step[] {
  const raw = context?.recentSteps;
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is Step => !!s && typeof s === 'object' && typeof (s as Step).at === 'string' && typeof (s as Step).text === 'string')
    .map(s => ({ at: s.at, type: typeof s.type === 'string' ? s.type : 'note', text: s.text }));
}

/** A plain-words guess at the cause from the details the device sent. Always a guess: it says what the evidence points to. */
export function diagnose(report: IssueReport, currentBuild?: string): string {
  const ctx = (report.context || {}) as Record<string, unknown>;
  const reach = (ctx.reachability || {}) as { portal?: unknown; database?: unknown };
  const portal = asProbe(reach.portal);
  const database = asProbe(reach.database);
  // A probe with an HTTP status got an answer from the server: that is a fault on our side, not a connection that was cut.
  if (portal?.status && !portal.ok) return `The portal answered with an error (HTTP ${portal.status}). This is a problem on our side, not on their network.`;
  if (database?.status && !database.ok) return `The database answered with an error (HTTP ${database.status}). This is a problem on our side, not on their network.`;
  if (portal && database && !portal.ok && database.ok) return 'Their device can reach the database but not the portal site (hub.delcargo.us). This is a network or provider problem on their side, not a bug in the app.';
  if (portal && database && !portal.ok && !database.ok) return 'Their device could reach neither the portal nor the database: no working internet, or a firewall blocking both.';
  if (portal?.ok && database && !database.ok) return 'The portal loads but the database (pb.delcargo.us) is unreachable from their device.';
  if (ctx.online === false) return 'Their device reported that it was offline.';
  const text = `${report.title} ${report.message}`;
  if (/loading chunk|dynamically imported module|unexpected token '?<|failed to load script/i.test(text)) {
    return currentBuild && report.build_id && report.build_id !== currentBuild
      ? 'This tab was opened before the latest release (its build differs from the current one). A page refresh fixes it.'
      : 'A page file failed to download. Usually a tab left open across a release, or a connection that dropped mid-load. A page refresh usually fixes it.';
  }
  if (/blocked by security policy/i.test(text)) return 'The browser blocked something the app tried to load. An extension, filter or security setting on their device may be involved.';
  if (report.kind === 'network') return 'Several requests in a row got no reply from the servers.';
  if (report.kind === 'crash' || report.kind === 'error') return 'An error in the app itself. Open the details and send the stack trace to the developer.';
  return 'Reported by the employee. Read their note and the details.';
}

const RANK: Record<IssueReport['status'], number> = { new: 0, seen: 1, resolved: 2 };

/** One group per problem (same fingerprint), most recently seen first. A group is "new" while any report in it is. */
export function groupReports(reports: IssueReport[], currentBuild?: string): IssueGroup[] {
  const byPrint = new Map<string, IssueReport[]>();
  for (const r of reports) byPrint.set(r.fingerprint, [...(byPrint.get(r.fingerprint) || []), r]);
  const when = (r: IssueReport) => r.occurred_at || r.created;
  return [...byPrint.entries()].map(([fingerprint, rows]) => {
    const sorted = [...rows].sort((a, b) => when(b).localeCompare(when(a)));
    return {
      fingerprint,
      title: sorted[0].title,
      kind: sorted[0].kind,
      count: sorted.length,
      people: [...new Set(sorted.map(r => r.email || 'unknown'))],
      lastSeen: when(sorted[0]),
      firstSeen: when(sorted[sorted.length - 1]),
      status: sorted.reduce((s, r) => (RANK[r.status] < RANK[s] ? r.status : s), 'resolved' as IssueReport['status']),
      hint: diagnose(sorted[0], currentBuild),
      reports: sorted,
    };
  }).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}
