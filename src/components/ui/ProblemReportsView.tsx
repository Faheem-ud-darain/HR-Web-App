'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { getAuthToken } from '@/lib/session';
import { API_BASE } from '@/lib/apiBase';
import { BUILD_ID } from '@/lib/issueReports/context';
import { groupReports, recentSteps, type IssueGroup, type IssueReport } from '@/lib/issueReports/group';

const KIND_LABEL: Record<IssueReport['kind'], string> = { crash: 'Screen crash', error: 'Error', network: 'Connection', manual: 'Reported by employee' };
const KIND_TONE: Record<IssueReport['kind'], BadgeVariant> = { crash: 'danger', error: 'warning', network: 'info', manual: 'indigo' };

const authHeaders = (): HeadersInit => ({ Authorization: `Bearer ${getAuthToken() || ''}`, 'Content-Type': 'application/json' });

async function fetchReports(): Promise<IssueReport[]> {
  const res = await fetch(`${API_BASE}/api/admin/issue-reports?days=30`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Reports request failed (${res.status})`);
  return ((await res.json()).items || []) as IssueReport[];
}

const when = (iso: string) => new Date(iso.replace(' ', 'T')).toLocaleString();
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

function probeText(v: unknown): string {
  const p = asObj(v);
  if (!('ok' in p)) return 'not tested';
  return p.ok ? `reachable (${p.ms} ms)` : `FAILED${p.status ? ` (HTTP ${p.status})` : ''}${p.error ? `: ${p.error}` : ''} after ${p.ms} ms`;
}

function reportAsText(r: IssueReport): string {
  const ctx = asObj(r.context);
  const reach = asObj(ctx.reachability);
  const steps = recentSteps(ctx);
  return [
    `${KIND_LABEL[r.kind]}: ${r.title}`, `When: ${when(r.occurred_at || r.created)}`, `Who: ${r.email || 'unknown'} (${r.role || '?'})`, `Page: ${r.route}`,
    r.note ? `Their note: ${r.note}` : '', `Message: ${r.message}`, `Release: ${r.build_id} | App ${String(ctx.appVersion || '')}`,
    `Device: ${String(ctx.userAgent || '')} | ${String(ctx.viewport || '')} | ${String(ctx.timezone || '')}`,
    `Connection: online=${String(ctx.online)} ${JSON.stringify(ctx.connection || {})}`,
    `Portal: ${probeText(reach.portal)} | Database: ${probeText(reach.database)}`,
    `Failed requests (5 min): ${JSON.stringify(ctx.failedRequests5min || {})}`,
    steps.length ? `Steps:\n${steps.map(s => `  ${s.at} [${s.type}] ${s.text}`).join('\n')}` : '', r.stack ? `Stack:\n${r.stack}` : '',
  ].filter(Boolean).join('\n');
}

function Detail({ report }: { report: IssueReport }) {
  const ctx = asObj(report.context);
  const reach = asObj(ctx.reachability);
  const steps = recentSteps(ctx);
  const failed = asObj(ctx.failedRequests5min);
  const row = (label: string, value: React.ReactNode) => value ? <div className="flex gap-2 text-xs"><dt className="w-28 shrink-0 font-semibold text-slate-500">{label}</dt><dd className="min-w-0 break-words text-slate-800">{value}</dd></div> : null;
  return (
    <div className="space-y-3 border-t border-slate-100 pt-3">
      <dl className="space-y-1">
        {row('When', when(report.occurred_at || report.created))}
        {row('Who', `${report.email || 'unknown'} (${report.role || '?'})`)}
        {row('Page', report.route)}
        {row('Their note', report.note)}
        {row('Message', report.message)}
        {row('Release', `${report.build_id}${BUILD_ID !== 'dev' && report.build_id && report.build_id !== BUILD_ID ? ' (older than the current release)' : ''} · app ${String(ctx.appVersion || '')}`)}
        {row('Device', `${String(ctx.userAgent || '')}`)}
        {row('Screen', `${String(ctx.viewport || '')} window, ${String(ctx.screen || '')} display`)}
        {row('Time zone', String(ctx.timezone || ''))}
        {row('Connection', `${ctx.online === false ? 'OFFLINE' : 'online'}${asObj(ctx.connection).type ? ` · ${String(asObj(ctx.connection).type)}, ${String(asObj(ctx.connection).rttMs)} ms round trip` : ''}`)}
        {row('Portal host', probeText(reach.portal))}
        {row('Database host', probeText(reach.database))}
        {row('Tab open for', ctx.tabOpenForMin !== undefined ? `${String(ctx.tabOpenForMin)} min` : '')}
        {row('Failed requests', Object.keys(failed).length ? Object.entries(failed).map(([h, v]) => `${h}: ${asObj(v).total} failed (${asObj(v).noReply} no reply)`).join(' · ') : '')}
      </dl>
      {steps.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-bold text-slate-600">What the app did just before</p>
          <ol className="space-y-0.5 rounded-lg bg-slate-50 p-2 text-caption text-slate-700">{steps.map((s, i) => <li key={i} className="break-words"><span className="text-slate-400">{new Date(s.at).toLocaleTimeString()}</span> · {s.text}</li>)}</ol>
        </div>
      )}
      {report.stack && <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-2 text-caption text-slate-700 whitespace-pre-wrap break-words">{report.stack}</pre>}
      <Button type="button" size="xs" variant="outline" onClick={() => void navigator.clipboard?.writeText(reportAsText(report))}>Copy all details</Button>
    </div>
  );
}

// HR and Admin's page of everything employees' devices reported in the last 30 days, grouped into one line per problem.
export function ProblemReportsView() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['issue_reports'], queryFn: fetchReports, retry: 2, refetchInterval: 60_000 });
  const [filter, setFilter] = useState<'open' | 'resolved'>('open');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const groups = useMemo(() => groupReports(data || [], BUILD_ID), [data]);
  const shown = groups.filter(g => (filter === 'open' ? g.status !== 'resolved' : g.status === 'resolved'));

  const act = async (group: IssueGroup, method: 'PATCH' | 'DELETE', status?: 'seen' | 'resolved') => {
    setActionError('');
    const ids = group.reports.map(r => r.id);
    for (let i = 0; i < ids.length; i += 300) { // the server takes at most 300 at a time
      const res = await fetch(`${API_BASE}/api/admin/issue-reports`, { method, headers: authHeaders(), body: JSON.stringify({ ids: ids.slice(i, i + 300), status }) }).catch(() => null);
      if (!res?.ok) { setActionError('Could not update these reports. Check your connection and try again.'); await qc.invalidateQueries({ queryKey: ['issue_reports'] }); return; }
    }
    await qc.invalidateQueries({ queryKey: ['issue_reports'] });
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Problem Reports" subtitle="Crashes, errors and connection problems sent automatically from employees' devices, plus reports they send themselves. Showing reports from the last 30 days." />
      <Tabs value={filter} onChange={setFilter} variant="segmented" items={[{ value: 'open', label: 'Open', count: groups.filter(g => g.status !== 'resolved').length }, { value: 'resolved', label: 'Resolved' }]} aria-label="Report status" />
      {actionError && <p role="alert" className="text-sm font-semibold text-rose-700">{actionError}</p>}
      {isLoading && <EmptyState py={10}>Loading reports…</EmptyState>}
      {isError && <EmptyState py={10} action={<Button size="sm" onClick={() => void refetch()}>Try again</Button>}>The reports could not be loaded.</EmptyState>}
      {!isLoading && !isError && shown.length === 0 && <EmptyState py={10} bordered>{filter === 'open' ? 'No open problems. Nothing has been reported.' : 'Nothing resolved yet.'}</EmptyState>}
      {shown.map(g => (
        <Card key={g.fingerprint}>
          <CardContent className="space-y-2">
            <button type="button" onClick={() => setOpenKey(openKey === g.fingerprint ? null : g.fingerprint)} className="w-full text-left" aria-expanded={openKey === g.fingerprint}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={KIND_TONE[g.kind]} size="sm">{KIND_LABEL[g.kind]}</Badge>
                {g.status === 'new' && <Badge variant="danger" size="sm">New</Badge>}
                <span className="text-xs text-slate-500">{g.count} report{g.count === 1 ? '' : 's'} · {g.people.length} {g.people.length === 1 ? 'person' : 'people'} · last {when(g.lastSeen)}</span>
              </div>
              <p className="mt-1 text-sm font-bold text-slate-900 break-words">{g.title}</p>
              <p className="text-xs text-slate-500 break-words">{g.people.join(', ')}</p>
              <p className="mt-1 text-xs text-slate-700"><span className="font-bold">Likely cause: </span>{g.hint}</p>
            </button>
            {openKey === g.fingerprint && (
              <>
                <div className="flex flex-wrap gap-2">
                  {g.status !== 'resolved' && <Button size="xs" variant="success" onClick={() => void act(g, 'PATCH', 'resolved')}>Mark resolved</Button>}
                  {g.status === 'new' && <Button size="xs" variant="outline" onClick={() => void act(g, 'PATCH', 'seen')}>Mark seen</Button>}
                  {g.status === 'resolved' && <Button size="xs" variant="danger" onClick={() => void act(g, 'DELETE')}>Delete reports</Button>}
                </div>
                {g.reports.slice(0, 5).map(r => <Detail key={r.id} report={r} />)}
                {g.reports.length > 5 && <p className="text-caption text-slate-500">Showing the 5 newest of {g.reports.length}.</p>}
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
