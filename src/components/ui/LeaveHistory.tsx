'use client';

import React, { useMemo, useState } from 'react';
import type { LeaveApplication } from '@/lib/hrData';
import { Card, CardContent } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Input';
import { ListSkeleton, TableSkeletonRows } from '@/components/ui/Skeleton';
import { LeaveStatusBadge, LeaveTypeBadge } from '@/components/ui/StatusBadges';
import { Table, TableScroll, TBody, Td, Th, THead, Tr } from '@/components/ui/Table';

// Pieces shared by the HR and Admin leave pages: the search match, the status/type filters with the History
// table (and its phone card stack), and the row of count tiles at the top.

export function matchesLeaveSearch(l: LeaveApplication, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return l.employeeName.toLowerCase().includes(q) || l.type.toLowerCase().includes(q) || l.reason.toLowerCase().includes(q);
}

const LEAVE_TYPES = ['PTO', 'Sick Leave', 'Urgent', 'Normal', 'Parental Leave'];

// Filter state lives with the page (HR also exports exactly the filtered rows), so this is a hook, not state
// hidden inside the view.
export function useLeaveFilters(leaves: LeaveApplication[], searchQuery: string) {
  const [status, setStatus] = useState<LeaveApplication['status'] | 'all'>('all');
  const [type, setType] = useState('all');
  const rows = useMemo(
    () => leaves.filter(l => (status === 'all' || l.status === status) && (type === 'all' || l.type === type) && matchesLeaveSearch(l, searchQuery)),
    [leaves, status, type, searchQuery],
  );
  return { status, setStatus, type, setType, rows };
}

interface LeaveHistoryProps {
  filters: ReturnType<typeof useLeaveFilters>;
  loading: boolean;
  // Employee name as the viewer should see it (aliases differ by role).
  nameFor: (employeeName: string) => string;
  // Optional per-row buttons (HR can send to CEO / reject / re-open). `variant` lets them size for a table row
  // or a phone card.
  actions?: (leave: LeaveApplication, variant: 'row' | 'card') => React.ReactNode;
}

export function LeaveHistory({ filters, loading, nameFor, actions }: LeaveHistoryProps) {
  const { rows } = filters;
  const cols = actions ? 6 : 5;
  const empty = 'No records match your filters.';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={filters.status} onChange={e => filters.setStatus(e.target.value as typeof filters.status)} fieldSize="md">
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="hr_approved">HR Approved</option>
          <option value="approved">CEO Approved</option>
          <option value="rejected">Rejected</option>
        </Select>
        <Select value={filters.type} onChange={e => filters.setType(e.target.value)} fieldSize="md">
          <option value="all">All Types</option>
          {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </Select>
        <span className="text-xs text-slate-400 font-semibold self-center">{rows.length} records</span>
      </div>

      <Card className="overflow-hidden p-0 border border-slate-200">
        <TableScroll hideOnMobile>
          <Table minWidth={750}>
            <THead>
              <tr>
                <Th>Employee</Th>
                <Th>Type</Th>
                <Th>Duration</Th>
                <Th>Reason</Th>
                <Th align="center">Status</Th>
                {actions && <Th align="center">Action</Th>}
              </tr>
            </THead>
            <TBody>
              {loading ? (
                <TableSkeletonRows rows={6} cols={cols} />
              ) : (
                <>
                  {rows.map(l => (
                    <Tr key={l.id}>
                      <Td density="cozy" className="font-semibold text-slate-900">{nameFor(l.employeeName)}</Td>
                      <Td density="cozy"><LeaveTypeBadge type={l.type} /></Td>
                      <Td density="cozy" className="text-slate-600 font-medium text-xs">{l.duration}</Td>
                      <Td density="cozy" className="text-slate-500 text-xs max-w-[200px] truncate">{l.reason}</Td>
                      <Td align="center" density="cozy"><LeaveStatusBadge status={l.status} /></Td>
                      {actions && <Td align="center" density="cozy">{actions(l, 'row')}</Td>}
                    </Tr>
                  ))}
                  {rows.length === 0 && (
                    <Tr><EmptyState as="td" colSpan={cols} py={12} size="sm">{empty}</EmptyState></Tr>
                  )}
                </>
              )}
            </TBody>
          </Table>
        </TableScroll>

        <div className="md:hidden space-y-3 p-4">
          {rows.map(l => (
            <div key={l.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900 truncate pr-2">{nameFor(l.employeeName)}</p>
                <LeaveStatusBadge status={l.status} className="shrink-0" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-caption text-slate-400 font-semibold uppercase">Type</p>
                  <LeaveTypeBadge type={l.type} className="inline-block" />
                </div>
                <div>
                  <p className="text-caption text-slate-400 font-semibold uppercase">Duration</p>
                  <p className="text-xs font-semibold text-slate-700">{l.duration}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-caption text-slate-400 font-semibold uppercase">Reason</p>
                  <p className="text-xs font-medium text-slate-600 line-clamp-2">{l.reason}</p>
                </div>
              </div>
              {actions && <div className="pt-2 border-t border-slate-100 flex justify-end gap-2">{actions(l, 'card')}</div>}
            </div>
          ))}
          {loading && <ListSkeleton rows={3} />}
          {!loading && rows.length === 0 && <EmptyState py={8} size="sm">{empty}</EmptyState>}
        </div>
      </Card>
    </div>
  );
}

type Tone = 'slate' | 'amber' | 'indigo' | 'emerald' | 'rose';
const TILE_TONE: Record<Tone, { box: string; text: string }> = {
  slate: { box: 'bg-slate-50 border-slate-200', text: 'text-slate-700' },
  amber: { box: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
  indigo: { box: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700' },
  emerald: { box: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  rose: { box: 'bg-rose-50 border-rose-200', text: 'text-rose-700' },
};

export function LeaveStatTiles({ tiles }: { tiles: { label: string; value: number; tone: Tone }[] }) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${tiles.length === 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
      {tiles.map(t => (
        <Card key={t.label} className={`border ${TILE_TONE[t.tone].box}`}>
          <CardContent className="p-3 text-center">
            <p className={`text-2xl font-bold ${TILE_TONE[t.tone].text}`}>{t.value}</p>
            <p className="text-caption font-bold text-slate-500 uppercase tracking-wider mt-0.5">{t.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
