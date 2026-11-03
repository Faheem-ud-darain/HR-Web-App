'use client';

import React, { useMemo, useState } from 'react';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatCard } from '@/components/ui/StatCard';
import { Table, TableScroll, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import { ArrowsClockwiseIcon, CopyIcon, MonitorIcon } from '@/components/ui/icons';
import { useProfiles } from '@/lib/hrData';
import { useTrackingHealth } from '@/lib/hr/trackingHealth';
import type { DiagnosisSeverity, DiagnosisState, TrackerDiagnosis } from '@/lib/core/trackerDiagnosis';

const STATE_LABEL: Record<DiagnosisState, string> = {
  healthy: 'Healthy', not_set_up: 'Not set up', tracking_off: 'Tracking off', not_installed: 'Never connected', offline: 'Offline',
  update_required: 'Update needed', stale_token: 'Old setup code', locked: 'Screen locked', capture_failing: 'Capture failing',
  no_captures: 'No screenshots', not_reporting: 'Cannot be checked', data_mismatch: 'Settings disagree', update_available: 'Not on latest',
};
const SEVERITY_BADGE: Record<DiagnosisSeverity, BadgeVariant> = { ok: 'success', info: 'default', warn: 'warning', problem: 'danger' };
const SEVERITY_RANK: Record<DiagnosisSeverity, number> = { problem: 0, warn: 1, info: 2, ok: 3 };

const ago = (iso: string | null, now: number): string => {
  if (!iso) return 'never';
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  return min < 1 ? 'just now' : min < 90 ? `${min} min ago` : min < 2880 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
};

// What a technician needs to go and check the tracker: when it last spoke, when it last sent a screenshot, which build, which device, the last error.
function detailLines(t: TrackerDiagnosis, now: number): string[] {
  const d = t.details;
  return [
    `Heard from: ${ago(d.lastSeenAt, now)}`,
    `Last screenshot: ${ago(d.lastCaptureAt, now)}${d.intervalMinutes ? ` (every ${d.intervalMinutes} min)` : ''}`,
    `${d.device || 'No device'}${d.agentVersion ? ` · v${d.agentVersion}` : ''}`,
    ...(d.onShiftSince ? [`On shift since ${new Date(d.onShiftSince).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`] : []),
    ...(d.failures ? [`${d.failures} failed captures in a row`] : []),
    ...(d.lastError ? [`Last error: ${d.lastError}`] : []),
  ];
}

// The Tracker Health screen, shared by the Admin and HR dashboards (both menus link to it; the data route refuses everyone else).
export function TrackerHealthView() {
  const health = useTrackingHealth();
  const { data: profiles } = useProfiles();
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [copied, setCopied] = useState(false);

  const nameOf = useMemo(() => {
    const byEmail = new Map((profiles || []).map(p => [p.email.toLowerCase(), p.fullName]));
    return (email: string) => byEmail.get(email.toLowerCase()) || '';
  }, [profiles]);

  const trackers = useMemo(() => [...(health.data?.trackers || [])].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.email.localeCompare(b.email)), [health.data]);
  const count = (s: DiagnosisSeverity) => trackers.filter(t => t.severity === s).length;
  const needAttention = count('problem') + count('warn');
  const behindLatest = trackers.filter(t => t.state === 'update_available' || t.state === 'update_required').length;
  const now = health.dataUpdatedAt || 0;
  const shown = onlyProblems ? trackers.filter((t: TrackerDiagnosis) => t.severity === 'problem' || t.severity === 'warn') : trackers;

  // Plain text for pasting to the technical team: everyone who needs attention, with the cause, the fix and the raw facts.
  const copyReport = () => {
    const text = trackers.filter(t => t.severity === 'problem' || t.severity === 'warn').map(t => [`${nameOf(t.email) || t.email} <${t.email}> - ${STATE_LABEL[t.state]}`, `  Wrong: ${t.cause}`, `  Do: ${t.action || 'Nothing'}`, ...detailLines(t, now).map(l => `  ${l}`)].join('\n')).join('\n\n');
    navigator.clipboard?.writeText(`Tracker health, ${new Date().toLocaleString()}\n\n${text || 'Nothing needs attention.'}`).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tracker Health</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Which trackers are working, what is wrong with the ones that are not, and what to do about it. The same check also alerts HR automatically during shifts.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={copyReport} disabled={!health.data}><CopyIcon className="h-4 w-4" aria-hidden="true" /> {copied ? 'Copied' : 'Copy report'}</Button>
          <Button variant="secondary" size="sm" onClick={() => health.refetch()} disabled={health.isFetching}>
            <ArrowsClockwiseIcon className={`h-4 w-4 ${health.isFetching ? 'animate-spin' : ''}`} aria-hidden="true" /> Check now
          </Button>
        </div>
      </div>

      {health.isError ? (
        <Card><CardContent><EmptyState>{(health.error as Error).message}</EmptyState></CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Need attention" value={health.isLoading ? '…' : needAttention} valueTone={needAttention ? 'danger' : 'success'} chip={{ icon: MonitorIcon, tone: needAttention ? 'amber' : 'emerald' }} />
            <StatCard label="Problems now" value={health.isLoading ? '…' : count('problem')} valueTone={count('problem') ? 'danger' : 'default'} sub="Needs action today" />
            <StatCard label="Healthy" value={health.isLoading ? '…' : count('ok')} valueTone="success" sub="Connected and capturing" />
            <StatCard label="Not on latest" value={health.isLoading ? '…' : behindLatest} valueTone={behindLatest ? 'warning' : 'success'} sub="Still need to update the tracker" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <Button size="sm" variant={onlyProblems ? 'primary' : 'secondary'} onClick={() => setOnlyProblems(true)}>Needs attention</Button>
              <Button size="sm" variant={!onlyProblems ? 'primary' : 'secondary'} onClick={() => setOnlyProblems(false)}>All trackers</Button>
            </div>
            {health.data && <p className="text-xs text-slate-500">Checked {new Date(health.data.checkedAt).toLocaleTimeString()}. Refreshes every minute.</p>}
          </div>

          <Card>
            <CardContent className="p-0">
              {health.isLoading ? (
                <EmptyState>Checking every tracker…</EmptyState>
              ) : shown.length === 0 ? (
                <EmptyState>{onlyProblems ? 'Every tracker that should be working is working.' : 'There are no employees to check.'}</EmptyState>
              ) : (
                <TableScroll>
                  <Table density="comfortable" size="sm" minWidth={980}>
                    <THead><Tr interactive={false}><Th>Employee</Th><Th>Status</Th><Th>What is wrong</Th><Th>What to do</Th><Th>Details</Th></Tr></THead>
                    <TBody>
                      {shown.map(t => (
                        <Tr key={t.email} interactive={false}>
                          <Td><div className="font-semibold text-slate-900">{nameOf(t.email) || t.email}</div>{nameOf(t.email) && <div className="text-xs text-slate-500">{t.email}</div>}</Td>
                          <Td><Badge variant={SEVERITY_BADGE[t.severity]} size="sm">{STATE_LABEL[t.state]}</Badge></Td>
                          <Td className="text-slate-700">{t.cause}</Td>
                          <Td className="text-slate-700">{t.action || <span className="text-slate-400">Nothing to do</span>}</Td>
                          <Td className="text-xs text-slate-600">{detailLines(t, now).map(l => <div key={l}>{l}</div>)}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </TableScroll>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
