'use client';

import { useLeaveNames } from '@/hooks/useLeaveNames';
import { CardStack } from '@/components/ui/CardStack';
import { CeoDecisionButtons, LeaveRequestCard } from '@/components/ui/leaves/LeaveRequestCard';
import { LeaveDateChangeRequests } from '@/components/ui/leaves/LeaveDateChangeRequests';
import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { ShieldCheckIcon as ShieldCheck, ListBulletsIcon as List, CircleNotchIcon as Loader2 } from '@/components/ui/icons';
import { useLeaves, useProfiles, hrActions, buildNotificationLink } from '@/lib/hrData';
import { useActionToast } from '@/components/ui/ActionToastHost';
import { LeaveTypeBadge } from '@/components/ui/StatusBadges';
import { LeaveHistory, LeaveStatTiles, matchesLeaveSearch, useLeaveFilters } from '@/components/ui/LeaveHistory';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TableScroll, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { TableSkeletonRows, ListSkeleton } from '@/components/ui/Skeleton';
import { LoadMoreHistory } from '@/components/ui/LoadMoreHistory';

type TabView = 'queue' | 'history';

const ALL_LEAVE_HISTORY_DAYS = 365 * 50; // effectively "everything"

export default function AdminLeavesPage() {
  const [leaveWindowDays, setLeaveWindowDays] = useState(365);
  const { data: leaves = [], isLoading: leavesLoading, isFetching: leavesFetching, refetch: refetchLeaves } = useLeaves({ windowDays: leaveWindowDays });
  const { data: employees = [] } = useProfiles();
  const [searchQuery, setSearchQuery] = useState('');
  const { showToast } = useActionToast();
  const [activeTab, setActiveTab] = useState<TabView>('queue');

  const { nameFor, pictureFor } = useLeaveNames('admin');
  const [processingLeaveId, setProcessingLeaveId] = useState<string | null>(null);

  useEffect(() => {
    const handleSearch = (e: Event) => setSearchQuery((e as CustomEvent).detail || '');
    window.addEventListener('globalSearch', handleSearch);
    return () => window.removeEventListener('globalSearch', handleSearch);
  }, []);

  const handleCEOAction = async (id: string, action: 'approve' | 'reject') => {
    if (processingLeaveId) return;
    setProcessingLeaveId(id);
    try {
      const nextStatus = action === 'approve' ? 'approved' : 'rejected';

      await hrActions.updateLeaveStatus(id, nextStatus);

      const l = leaves.find(lv => lv.id === id);
      if (l) {
        const emp = employees.find(e => e.fullName === l.employeeName);
        if (emp) {
          await hrActions.addNotification(emp.email, 'employee', `Your leave (${l.duration.split(' - ')[0]}) was ${action === 'approve' ? 'approved' : 'rejected'} by the CEO.`, 'leave_task', action === 'approve' ? 'Leave Approved' : 'Leave Rejected', undefined, buildNotificationLink('employee', 'leave', l.id));
        }
        await hrActions.addNotification('all', 'hr', `CEO ${action === 'approve' ? 'Approved' : 'Rejected'} leave for ${l.employeeName}.`, 'leave_task', `${l.employeeName}'s Leave`, undefined, buildNotificationLink('hr', 'leave', l.id));
      }

      refetchLeaves();
      showToast({ type: 'success', message: `Leave ${action === 'approve' ? 'approved' : 'rejected'} by CEO!` });
    } finally {
      setProcessingLeaveId(null);
    }
  };

  const stats = {
    total: leaves.length,
    pending: leaves.filter(l => l.status === 'pending').length,
    hrApproved: leaves.filter(l => l.status === 'hr_approved').length,
    approved: leaves.filter(l => l.status === 'approved').length,
    rejected: leaves.filter(l => l.status === 'rejected').length,
  };

  const pendingCEOLeaves = leaves.filter(l => l.status === 'hr_approved' && matchesLeaveSearch(l, searchQuery));
  const filters = useLeaveFilters(leaves, searchQuery);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leave Approvals</h1>
          <p className="text-slate-500 text-sm">Final CEO decisions on HR-approved leaves. See full org history in the History tab.</p>
        </div>
      </div>

      <LeaveDateChangeRequests onAnswered={refetchLeaves} />

      <LeaveStatTiles
        tiles={[
          { label: 'Total Requests', value: stats.total, tone: 'slate' },
          { label: 'Pending', value: stats.pending, tone: 'amber' },
          { label: 'Awaiting CEO', value: stats.hrApproved, tone: 'indigo' },
          { label: 'Approved', value: stats.approved, tone: 'emerald' },
          { label: 'Rejected', value: stats.rejected, tone: 'rose' },
        ]}
      />

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { value: 'queue', label: 'CEO Approval Queue', icon: <ShieldCheck className="h-4 w-4" />, badge: stats.hrApproved },
          { value: 'history', label: 'Full History', icon: <List className="h-4 w-4" /> },
        ]}
      />

      <LoadMoreHistory
        days={leaveWindowDays}
        maxDays={ALL_LEAVE_HISTORY_DAYS}
        loading={leavesFetching}
        noun="leaves"
        // A year at a time for the first few years, then one more press loads everything (older
        // backfilled leaves used to be unreachable past five years, and missing from the HR CSV).
        onLoadMore={() => setLeaveWindowDays(d => (d < 365 * 3 ? d + 365 : ALL_LEAVE_HISTORY_DAYS))}
      />

      {/* ── CEO QUEUE TAB ── */}
      {activeTab === 'queue' && (
        <Card className="overflow-hidden p-0 border border-slate-200">
          <TableScroll hideOnMobile>
            <Table minWidth={750}>
              <THead>
                <tr>
                  <Th>Employee</Th>
                  <Th>Type</Th>
                  <Th>Dates</Th>
                  <Th>Reason</Th>
                  <Th align="center">Actions</Th>
                </tr>
              </THead>
              <TBody>
{leavesLoading ? (
  <TableSkeletonRows rows={6} cols={5} />
) : (
<>
                {pendingCEOLeaves.map(leave => (
                  <Tr key={leave.id}>
                    <Td className="font-semibold text-slate-900">{nameFor(leave.employeeName)}</Td>
                    <Td>
                      <LeaveTypeBadge type={leave.type} />
                    </Td>
                    <Td className="text-slate-600 font-medium text-xs">{leave.duration}</Td>
                    <Td className="text-slate-500 max-w-xs truncate text-xs">{leave.reason}</Td>
                    <Td align="center">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => handleCEOAction(leave.id, 'approve')} disabled={processingLeaveId !== null} className="text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded transition-colors transition-transform active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1">
                          {processingLeaveId === leave.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />} CEO Approve
                        </button>
                        <button onClick={() => handleCEOAction(leave.id, 'reject')} disabled={processingLeaveId !== null} className="text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded transition-colors transition-transform active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1">
                          {processingLeaveId === leave.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Reject
                        </button>
                      </div>
                    </Td>
                  </Tr>
                ))}
                {pendingCEOLeaves.length === 0 && (
                  <Tr>
                    <EmptyState as="td" colSpan={5} py={12} size="sm">
                      No leaves waiting for CEO approval.
                    </EmptyState>
                  </Tr>
                )}
              </>
)}
</TBody>
            </Table>
          </TableScroll>
          
          <div className="md:hidden p-4">
            {!leavesLoading && (
              <CardStack
                items={pendingCEOLeaves} keyOf={l => l.id} label="Leaves waiting for CEO approval"
                peek={l => `${nameFor(l.employeeName)} · ${l.type} leave · ${l.duration}`}
                render={l => <LeaveRequestCard leave={l} name={nameFor(l.employeeName)} picture={pictureFor(l.employeeName)}><CeoDecisionButtons busy={processingLeaveId === l.id} disabled={processingLeaveId !== null} onDecide={action => handleCEOAction(l.id, action)} /></LeaveRequestCard>}
              />
            )}
            {leavesLoading && <ListSkeleton rows={3} />}
            {!leavesLoading && pendingCEOLeaves.length === 0 && (
              <EmptyState py={8} size="sm">
                No leaves waiting for CEO approval.
              </EmptyState>
            )}
          </div>
        </Card>
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === 'history' && <LeaveHistory filters={filters} loading={leavesLoading} nameFor={nameFor} />}
    </div>
  );
}
