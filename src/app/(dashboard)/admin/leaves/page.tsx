'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { ShieldCheck, List, Loader2 } from 'lucide-react';
import { useLeaves, useProfiles, hrActions, LeaveApplication, Profile, displayName, buildNotificationLink } from '@/lib/hrData';
import { useActionToast } from '@/components/ui/ActionToastHost';
import { LEAVE_TYPE_COLORS, LeaveStatusBadge } from '@/components/ui/StatusBadges';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TableScroll, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { TableSkeletonRows, ListSkeleton } from '@/components/ui/Skeleton';
import { LoadMoreHistory } from '@/components/ui/LoadMoreHistory';
import { Select } from '@/components/ui/Input';

type TabView = 'queue' | 'history';

export default function AdminLeavesPage() {
  const [leaveWindowDays, setLeaveWindowDays] = useState(365);
  const { data: leaves = [], isLoading: leavesLoading, isFetching: leavesFetching, refetch: refetchLeaves } = useLeaves({ windowDays: leaveWindowDays });
  const { data: employees = [] } = useProfiles();
  const [searchQuery, setSearchQuery] = useState('');
  const { showToast } = useActionToast();
  const [activeTab, setActiveTab] = useState<TabView>('queue');
  const [histFilter, setHistFilter] = useState<LeaveApplication['status'] | 'all'>('all');

  // See the matching comment in hr/leaves/page.tsx — LeaveApplication only
  // snapshots a fullName, not a live Profile reference.
  const nameFor = (employeeName: string): string => {
    const emp = employees.find((e: Profile) => e.fullName === employeeName);
    return emp ? displayName(emp, 'admin') : employeeName;
  };
  const [histType, setHistType] = useState<'all' | 'PTO' | 'Sick Leave' | 'Urgent' | 'Normal' | 'Parental Leave'>('all');
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

  const pendingCEOLeaves = leaves.filter(l =>
    l.status === 'hr_approved' &&
    (l.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
     l.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
     l.reason.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const historyLeaves = leaves.filter(l =>
    (histFilter === 'all' || l.status === histFilter) &&
    (histType === 'all' || l.type === histType) &&
    (searchQuery === '' ||
      l.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.reason.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leave Approvals</h1>
          <p className="text-slate-500 text-sm">Final CEO decisions on HR-approved leaves. See full org history in the History tab.</p>
        </div>
      </div>

      {/* Stat overview */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Requests', value: stats.total,      bg: 'bg-slate-50 border-slate-200',         text: 'text-slate-700'   },
          { label: 'Pending',        value: stats.pending,    bg: 'bg-amber-50 border-amber-200',          text: 'text-amber-700'   },
          { label: 'Awaiting CEO',   value: stats.hrApproved, bg: 'bg-indigo-50 border-indigo-200',        text: 'text-indigo-700'  },
          { label: 'Approved',       value: stats.approved,   bg: 'bg-emerald-50 border-emerald-200',      text: 'text-emerald-700' },
          { label: 'Rejected',       value: stats.rejected,   bg: 'bg-rose-50 border-rose-200',            text: 'text-rose-700'    },
        ].map(s => (
          <Card key={s.label} className={`border ${s.bg}`}>
            <CardContent className="p-3 text-center">
              <p className={`text-2xl font-bold ${s.text}`}>{s.value}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

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
        maxDays={365 * 5}
        loading={leavesFetching}
        noun="leaves"
        onLoadMore={() => setLeaveWindowDays(d => d + 365)}
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
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${LEAVE_TYPE_COLORS[leave.type] || ''}`}>{leave.type}</span>
                    </Td>
                    <Td className="text-slate-600 font-medium text-xs">{leave.duration}</Td>
                    <Td className="text-slate-500 max-w-xs truncate text-xs">{leave.reason}</Td>
                    <Td align="center">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => handleCEOAction(leave.id, 'approve')} disabled={processingLeaveId !== null} className="text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded transition-colors transition-transform active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1">
                          {processingLeaveId === leave.id && <Loader2 className="h-3 w-3 animate-spin" />} CEO Approve
                        </button>
                        <button onClick={() => handleCEOAction(leave.id, 'reject')} disabled={processingLeaveId !== null} className="text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded transition-colors transition-transform active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1">
                          {processingLeaveId === leave.id && <Loader2 className="h-3 w-3 animate-spin" />} Reject
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
          
          <div className="md:hidden space-y-3 p-4">
            {pendingCEOLeaves.map(leave => (
              <div key={leave.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-900">{nameFor(leave.employeeName)}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${LEAVE_TYPE_COLORS[leave.type] || ''}`}>{leave.type}</span>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Dates</p>
                  <p className="text-xs font-semibold text-slate-800">{leave.duration}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Reason</p>
                  <p className="text-xs text-slate-600 line-clamp-2">{leave.reason}</p>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button onClick={() => handleCEOAction(leave.id, 'approve')} className="text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded transition-colors transition-transform active:scale-97">
                    CEO Approve
                  </button>
                  <button onClick={() => handleCEOAction(leave.id, 'reject')} className="text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded transition-colors transition-transform active:scale-97">
                    Reject
                  </button>
                </div>
              </div>
            ))}
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
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select
              value={histFilter}
              onChange={e => setHistFilter(e.target.value as LeaveApplication['status'] | 'all')}
              fieldSize="md"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="hr_approved">HR Approved</option>
              <option value="approved">CEO Approved</option>
              <option value="rejected">Rejected</option>
            </Select>
            <Select
              value={histType}
              onChange={e => setHistType(e.target.value as typeof histType)}
              fieldSize="md"
            >
              <option value="all">All Types</option>
              <option value="PTO">PTO</option>
              <option value="Sick Leave">Sick Leave</option>
              <option value="Urgent">Urgent</option>
              <option value="Normal">Normal</option>
              <option value="Parental Leave">Parental Leave</option>
            </Select>
            <span className="text-xs text-slate-400 font-semibold self-center">{historyLeaves.length} records</span>
          </div>

          <Card className="overflow-hidden p-0 border border-slate-200">
            <TableScroll hideOnMobile>
              <Table minWidth={750}>
                <THead>
                  <tr>
                    <Th>Employee</Th>
                    <Th>Type</Th>
                    <Th>Dates</Th>
                    <Th>Reason</Th>
                    <Th align="center">Status</Th>
                  </tr>
                </THead>
                <TBody>
{leavesLoading ? (
  <TableSkeletonRows rows={6} cols={5} />
) : (
<>
                  {historyLeaves.map(l => (
                    <Tr key={l.id}>
                      <Td density="cozy" className="font-semibold text-slate-900">{nameFor(l.employeeName)}</Td>
                      <Td density="cozy">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${LEAVE_TYPE_COLORS[l.type] || 'bg-slate-100 text-slate-600'}`}>{l.type}</span>
                      </Td>
                      <Td density="cozy" className="text-slate-600 font-medium text-xs">{l.duration}</Td>
                      <Td density="cozy" className="text-slate-500 text-xs max-w-[200px] truncate">{l.reason}</Td>
                      <Td align="center" density="cozy">
                        <LeaveStatusBadge status={l.status} />
                      </Td>
                    </Tr>
                  ))}
                  {historyLeaves.length === 0 && (
                    <Tr>
                      <EmptyState as="td" colSpan={5} py={12} size="sm">
                        No records match your filters.
                      </EmptyState>
                    </Tr>
                  )}
                </>
)}
</TBody>
              </Table>
            </TableScroll>

            <div className="md:hidden space-y-3 p-4">
              {historyLeaves.map(l => (
                <div key={l.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900">{nameFor(l.employeeName)}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${LEAVE_TYPE_COLORS[l.type] || 'bg-slate-100 text-slate-600'}`}>{l.type}</span>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Dates</p>
                    <p className="text-xs font-semibold text-slate-800">{l.duration}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Reason</p>
                    <p className="text-xs text-slate-600 line-clamp-2">{l.reason}</p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Status</p>
                    <LeaveStatusBadge status={l.status} />
                  </div>
                </div>
              ))}
              {leavesLoading && <ListSkeleton rows={3} />}
              {!leavesLoading && historyLeaves.length === 0 && (
                <EmptyState py={8} size="sm">
                  No records match your filters.
                </EmptyState>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
