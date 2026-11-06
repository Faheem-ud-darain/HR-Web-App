'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { Table, TableScroll, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import { ArrowsClockwiseIcon } from '@/components/ui/icons';
import { useCommunicationAudit } from '@/lib/hr/audit';
import { COMMUNICATION_KINDS, KIND_LABEL } from '@/lib/core/communicationAudit';

// The permanent trail of every ticket, chat message and announcement: which account, from which address and device, and when. Shared by the
// Admin and HR dashboards. It is deliberately not in any menu (open /admin/audit-trail or /hr/audit-trail) and read-only: nothing here, or
// anywhere in the app, can edit or delete an entry. The data route refuses everyone but HR and Admin.
export function CommunicationAuditView() {
  const [kind, setKind] = useState('');
  const [who, setWho] = useState('');
  const trail = useCommunicationAudit({ kind, who: who.trim() });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Communication trail</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Who sent each ticket, chat message and announcement, from which address and device. Recorded by the server when the message is sent. It cannot be edited or deleted. Only HR and Admin can see this page.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => trail.refetch()} disabled={trail.isFetching}>
          <ArrowsClockwiseIcon className={`h-4 w-4 ${trail.isFetching ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={kind} onChange={e => setKind(e.target.value)} fieldSize="sm" aria-label="What was sent">
          <option value="">Everything</option>
          {COMMUNICATION_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </Select>
        <Input value={who} onChange={e => setWho(e.target.value)} placeholder="Search an account or address" fieldSize="sm" className="w-64" aria-label="Search" />
      </div>

      <Card>
        <CardContent className="p-0">
          {trail.isError ? (
            <EmptyState>{(trail.error as Error).message}</EmptyState>
          ) : trail.isLoading ? (
            <EmptyState>Loading…</EmptyState>
          ) : trail.data && !trail.data.configured ? (
            <EmptyState>The trail is not switched on yet. An Admin runs the one-time setup (ensureCommunicationAudit) once; entries are recorded from then on.</EmptyState>
          ) : !trail.data || trail.data.items.length === 0 ? (
            <EmptyState>Nothing recorded yet for this search.</EmptyState>
          ) : (
            <TableScroll>
              <Table density="comfortable" size="sm" minWidth={900}>
                <THead><Tr interactive={false}><Th>When</Th><Th>What</Th><Th>Signed in as</Th><Th>Address</Th><Th>Device</Th><Th>Reference</Th></Tr></THead>
                <TBody>
                  {trail.data.items.map(r => (
                    <Tr key={r.id} interactive={false}>
                      <Td className="whitespace-nowrap text-slate-700">{new Date(r.occurredAt).toLocaleString()}</Td>
                      <Td><Badge variant="default" size="sm">{KIND_LABEL[r.kind] ?? r.kind}</Badge></Td>
                      <Td>
                        <div className="font-semibold text-slate-900">{r.actor}</div>
                        <div className="text-xs text-slate-500">{r.actorRole}</div>
                        {r.nameMismatch && <Badge variant="warning" size="sm" className="mt-1">Message says {r.claimedSender}</Badge>}
                      </Td>
                      <Td className="text-slate-700">{r.ip || '—'}{r.country && <span className="ml-1 text-xs text-slate-500">({r.country})</span>}</Td>
                      <Td className="text-slate-700">{r.device}</Td>
                      <Td className="font-mono text-xs text-slate-500">{r.refId}{r.messageId && <div>{r.messageId}</div>}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableScroll>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
