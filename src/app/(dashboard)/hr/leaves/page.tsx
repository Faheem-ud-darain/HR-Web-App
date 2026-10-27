'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { hrActions, LeaveApplication, Profile, useLeaves, useProfiles, displayName, buildNotificationLink } from '@/lib/hrData';
import { useActionToast } from '@/components/ui/ActionToastHost';
import { Button } from '@/components/ui/Button';
import { GripVertical, BarChart3, List, Download, Lock, Calendar, Loader2 } from 'lucide-react';
import { LeaveStatusBadge, LeaveTypeBadge } from '@/components/ui/StatusBadges';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TableScroll, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { TableSkeletonRows, ListSkeleton } from '@/components/ui/Skeleton';
import { LoadMoreHistory } from '@/components/ui/LoadMoreHistory';
import { Select } from '@/components/ui/Input';

const COLUMNS: { key: LeaveApplication['status']; label: string; headerBg: string; locked?: boolean }[] = [
  { key: 'pending',     label: 'Pending Review',       headerBg: 'bg-amber-50 border-amber-200'   },
  { key: 'hr_approved', label: 'HR Approved → CEO',    headerBg: 'bg-indigo-50 border-indigo-200' },
  // Dropping here is blocked in handleDrop — final approval is a CEO/Admin
  // decision made from the Admin dashboard's CEO Approval Queue, not
  // something HR grants by dragging a card on their own board.
  { key: 'approved',    label: 'CEO Approved',         headerBg: 'bg-emerald-50 border-emerald-200', locked: true },
  { key: 'rejected',    label: 'Rejected (Re-open ↩)', headerBg: 'bg-rose-50 border-rose-200'     },
];

type TabView = 'kanban' | 'history';

const ALL_LEAVE_HISTORY_DAYS = 365 * 50; // effectively "everything"

export default function HRLeavesPage() {
  const [leaveWindowDays, setLeaveWindowDays] = useState(365);
  const { data: leaves = [], isLoading: leavesLoading, isFetching: leavesFetching, refetch: refetchLeaves } = useLeaves({ windowDays: leaveWindowDays });
  const { data: employees = [] } = useProfiles();
  const [dragId, setDragId] = useState<string | null>(null);
  // Phone/tablet board: one status at a time. Until you pick one it shows the first status that has cards.
  const [mobileColChoice, setMobileColChoice] = useState<LeaveApplication['status'] | null>(null);
  const [overCol, setOverCol] = useState<LeaveApplication['status'] | null>(null);
  const { showToast } = useActionToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabView>('kanban');

  // LeaveApplication only stores a fullName snapshot (employeeName), not a
  // live Profile reference, so alias resolution needs a lookup against the
  // current employees list — falls back to the raw snapshot if the
  // employee can't be matched (e.g. since-deleted record).
  const nameFor = (employeeName: string): string => {
    const emp = employees.find((e: Profile) => e.fullName === employeeName);
    return emp ? displayName(emp, 'hr') : employeeName;
  };

  // History filters
  const [histFilter, setHistFilter] = useState<LeaveApplication['status'] | 'all'>('all');
  const [histType, setHistType] = useState<'all' | 'PTO' | 'Sick Leave' | 'Urgent' | 'Normal' | 'Parental Leave'>('all');
  const [processingLeaveId, setProcessingLeaveId] = useState<string | null>(null);

  const handleSendToCEO = async (l: LeaveApplication) => {
    if (processingLeaveId) return;
    setProcessingLeaveId(l.id);
    try {
      await hrActions.updateLeaveStatus(l.id, 'hr_approved');
      refetchLeaves();
      await hrActions.addNotification('all', 'admin', `CEO approval required for ${l.employeeName}'s leave.`, 'leave_task', `${l.employeeName}'s Leave`, undefined, buildNotificationLink('admin', 'leave', l.id));
      // Same gap as the Kanban path — only 'admin' was notified, so HR
      // itself never saw confirmation of its own action in the bell.
      await hrActions.addNotification('all', 'hr', `Leave for ${l.employeeName} forwarded to CEO for approval.`, 'leave_task', `${l.employeeName}'s Leave`, undefined, buildNotificationLink('hr', 'leave', l.id));
      showToast({ type: 'success', message: 'Sent to CEO!' });
    } finally {
      setProcessingLeaveId(null);
    }
  };

  const handleHistoryReject = async (l: LeaveApplication) => {
    if (processingLeaveId) return;
    setProcessingLeaveId(l.id);
    try {
      await hrActions.updateLeaveStatus(l.id, 'rejected');
      // This quick-action button previously updated the status with no
      // notification at all — the employee had no way of finding out
      // except by checking the portal themselves. The Kanban drag-to-reject
      // path already notified; this brings the History tab's button in
      // line with it.
      const emp = employees.find((e: Profile) => e.fullName === l.employeeName);
      if (emp) await hrActions.addNotification(emp.email, 'employee', `Your leave (${l.duration.split(' - ')[0]}) was rejected.`, 'leave_task', 'Leave Rejected', undefined, buildNotificationLink('employee', 'leave', l.id));
      await hrActions.addNotification('all', 'hr', `Leave for ${l.employeeName} rejected by HR.`, 'leave_task', `${l.employeeName}'s Leave`, undefined, buildNotificationLink('hr', 'leave', l.id));
      refetchLeaves();
      showToast({ type: 'success', message: 'Rejected!' });
    } finally {
      setProcessingLeaveId(null);
    }
  };

  const handleReopenLeave = async (l: LeaveApplication) => {
    if (processingLeaveId) return;
    setProcessingLeaveId(l.id);
    try {
      await hrActions.updateLeaveStatus(l.id, 'pending');
      await hrActions.addNotification('all', 'hr', `Leave for ${l.employeeName} re-opened for reconsideration.`, 'leave_task', `${l.employeeName}'s Leave`, undefined, buildNotificationLink('hr', 'leave', l.id));
      refetchLeaves();
      showToast({ type: 'success', message: 'Re-opened for review!' });
    } finally {
      setProcessingLeaveId(null);
    }
  };

  useEffect(() => {
    const handleSearch = (e: Event) => setSearchQuery((e as CustomEvent).detail || '');
    window.addEventListener('globalSearch', handleSearch);
    return () => window.removeEventListener('globalSearch', handleSearch);
  }, []);

  // ---------- Drag & Drop handlers ----------
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    setDragId(id);
  };
  const handleDragOver = (e: React.DragEvent, col: LeaveApplication['status']) => {
    e.preventDefault();
    setOverCol(col);
  };
  const handleDragLeave = () => setOverCol(null);

  // Core status-change logic, shared by the desktop drag-and-drop handler
  // below AND the mobile status <select> rendered on each card. HTML5's
  // native drag-and-drop API (draggable/onDragStart/onDragOver/onDrop) never
  // fires on touch devices at all — not a sizing/CSS issue, just a hard
  // browser limitation — so phones need a completely different interaction
  // to reach this same code path.
  const moveLeaveTo = async (leaf: LeaveApplication, targetStatus: LeaveApplication['status']) => {
    if (processingLeaveId) return; // one change at a time: no double taps
    setProcessingLeaveId(leaf.id);
    try { await moveLeaveToNow(leaf, targetStatus); } finally { setProcessingLeaveId(null); }
  };
  const moveLeaveToNow = async (leaf: LeaveApplication, targetStatus: LeaveApplication['status']) => {
    if (leaf.status === targetStatus) return;

    // Final approval is a CEO/Admin-only decision (see admin/leaves page's
    // CEO Approval Queue) — HR forwards a request, they don't get to grant
    // "CEO Approved" themselves just by dragging a card. Previously nothing
    // stopped HR from dropping straight into this column, which silently
    // fired the exact "fully approved" notification a real CEO decision
    // sends, even though the CEO never approved anything.
    if (targetStatus === 'approved') {
      showToast({ type: 'error', message: 'Only Admin/CEO can grant final approval. Use "Send to CEO" — they\'ll approve or reject it from their dashboard.' });
      return;
    }
    // Once it's in the CEO's queue, rejecting it is also the CEO's call —
    // HR can still reject directly from "Pending" (before forwarding), just
    // not override a request that's already awaiting CEO review.
    if (targetStatus === 'rejected' && leaf.status === 'hr_approved') {
      showToast({ type: 'error', message: 'This request is already with the CEO for review — only they can reject it now.' });
      return;
    }

    if (targetStatus === 'hr_approved') {
      await hrActions.addNotification('all', 'admin', `CEO approval required: HR approved leave for ${leaf.employeeName}.`, 'leave_task', `${leaf.employeeName}'s Leave`, undefined, buildNotificationLink('admin', 'leave', leaf.id));
      // This only ever notified 'admin' — the HR user who actually dragged
      // the card got zero feedback in their own bell (only dropping into
      // "CEO Approved" happened to also notify 'hr', which is why that one
      // looked like it "worked" and this one looked broken). Every HR
      // action should show up on the shared HR feed, same as every other
      // action type in this app.
      await hrActions.addNotification('all', 'hr', `Leave for ${leaf.employeeName} forwarded to CEO for approval.`, 'leave_task', `${leaf.employeeName}'s Leave`, undefined, buildNotificationLink('hr', 'leave', leaf.id));
    } else if (targetStatus === 'rejected') {
      const emp = employees.find((e: Profile) => e.fullName === leaf.employeeName);
      if (emp) await hrActions.addNotification(emp.email, 'employee', `Your leave (${leaf.duration.split(' - ')[0]}) was rejected.`, 'leave_task', 'Leave Rejected', undefined, buildNotificationLink('employee', 'leave', leaf.id));
      await hrActions.addNotification('all', 'hr', `Leave for ${leaf.employeeName} rejected by HR.`, 'leave_task', `${leaf.employeeName}'s Leave`, undefined, buildNotificationLink('hr', 'leave', leaf.id));
    } else if (targetStatus === 'pending') {
      await hrActions.addNotification('all', 'hr', `Leave for ${leaf.employeeName} re-opened for reconsideration.`, 'leave_task', `${leaf.employeeName}'s Leave`, undefined, buildNotificationLink('hr', 'leave', leaf.id));
    }

    await hrActions.updateLeaveStatus(leaf.id, targetStatus);
    refetchLeaves();

    showToast({ type: 'success', message: 'Leave status updated!' });
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: LeaveApplication['status']) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    setDragId(null);
    setOverCol(null);
    if (!id) return;

    const leaf = leaves.find((l) => l.id === id);
    if (!leaf) return;
    await moveLeaveTo(leaf, targetStatus);
  };

  const filteredInCol = (status: LeaveApplication['status']) =>
    leaves.filter(l =>
      l.status === status &&
      (l.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
       l.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
       l.reason.toLowerCase().includes(searchQuery.toLowerCase()))
    );

  const mobileCol = mobileColChoice ?? (COLUMNS.find(c => leaves.some(l => l.status === c.key))?.key ?? 'pending');

  const historyLeaves = leaves.filter(l =>
    (histFilter === 'all' || l.status === histFilter) &&
    (histType === 'all' || l.type === histType) &&
    (searchQuery === '' ||
      l.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.reason.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Overview stats
  const stats = {
    total: leaves.length,
    pending: leaves.filter(l => l.status === 'pending').length,
    approved: leaves.filter(l => l.status === 'approved').length,
    rejected: leaves.filter(l => l.status === 'rejected').length,
  };

  const exportLeavesCSV = () => {
    const headers = ['Employee', 'Type', 'Duration', 'Reason', 'Status'];
    const rows = historyLeaves.map(l => [l.employeeName, l.type, l.duration, l.reason, l.status]);
    const csvContent = 'data:text/csv;charset=utf-8,'
      + [headers.join(','), ...rows.map(r => r.map(val => `"${val}"`).join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `DelCargo_Leaves_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leave Management</h1>
          <p className="text-slate-500 text-sm">Drag cards to update status (or use the status dropdown on mobile) · Switch to History for a full audit log.</p>
        </div>
        <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="md"
          onClick={exportLeavesCSV}
          disabled={historyLeaves.length === 0}
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
        </div>
      </div>

      {/* Overview stat cards — status breakdown only. The earlier version
          also tacked on a PTO/Sick/Urgent type breakdown at the same visual
          weight, which duplicated the Type column already visible on every
          kanban card and history row without adding new information. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',    value: stats.total,    bg: 'bg-slate-50 border-slate-200',          text: 'text-slate-700' },
          { label: 'Pending',  value: stats.pending,  bg: 'bg-amber-50 border-amber-200',           text: 'text-amber-700' },
          { label: 'Approved', value: stats.approved, bg: 'bg-emerald-50 border-emerald-200',       text: 'text-emerald-700' },
          { label: 'Rejected', value: stats.rejected, bg: 'bg-rose-50 border-rose-200',             text: 'text-rose-700' },
        ].map(s => (
          <Card key={s.label} className={`border ${s.bg}`}>
            <CardContent className="p-3 text-center">
              <p className={`text-2xl font-bold ${s.text}`}>{s.value}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tab toggle */}
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { value: 'kanban', label: 'Kanban Board', icon: <BarChart3 className="h-4 w-4" /> },
          { value: 'history', label: 'History & Audit Log', icon: <List className="h-4 w-4" /> },
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

      {/* ── KANBAN VIEW ── */}
      {activeTab === 'kanban' && leavesLoading && <ListSkeleton rows={4} />}
      {activeTab === 'kanban' && !leavesLoading && (
        <div className="xl:hidden space-y-3">
          {/* Phones and tablets: touch screens cannot drag cards, so the board is one status at a time with
              clear buttons on each card. The buttons run the same moveLeaveTo() rules as the desktop drag. */}
          <div role="tablist" aria-label="Leave status" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide">
            {COLUMNS.map(col => {
              const count = filteredInCol(col.key).length;
              const active = mobileCol === col.key;
              return (
                <button
                  key={col.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMobileColChoice(col.key)}
                  className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-bold transition-colors ${active ? `${col.headerBg} text-slate-900` : 'border-slate-200 bg-white text-slate-500'}`}
                >
                  {col.label}
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full border border-slate-200 bg-white px-1 text-[11px] text-slate-600">{count}</span>
                </button>
              );
            })}
          </div>
          {(() => {
            const cards = filteredInCol(mobileCol);
            if (cards.length === 0) return <div className="rounded-xl border-2 border-dashed border-slate-200 py-10 text-center text-sm font-semibold text-slate-400">Nothing here</div>;
            return (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {cards.map(leave => {
                  const busy = processingLeaveId === leave.id;
                  return (
                    <div key={leave.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 text-sm font-bold leading-tight text-slate-900 break-words">{nameFor(leave.employeeName)}</div>
                        <LeaveTypeBadge type={leave.type} className="shrink-0" />
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Calendar className="h-3.5 w-3.5 shrink-0" /> {leave.duration}</div>
                      {leave.reason && <p className="mt-2 text-xs leading-relaxed text-slate-500 break-words">{leave.reason}</p>}
                      {leave.status === 'pending' && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button type="button" disabled={busy} onClick={() => moveLeaveTo(leave, 'hr_approved')} className="min-h-11 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">Send to CEO</button>
                          <button type="button" disabled={busy} onClick={() => moveLeaveTo(leave, 'rejected')} className="min-h-11 rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60">Reject</button>
                        </div>
                      )}
                      {leave.status === 'hr_approved' && <p className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">With the CEO for the final decision.</p>}
                      {leave.status === 'approved' && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Approved by the CEO.</p>}
                      {leave.status === 'rejected' && (
                        <button type="button" disabled={busy} onClick={() => moveLeaveTo(leave, 'pending')} className="mt-3 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Re-open for review</button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
      {activeTab === 'kanban' && !leavesLoading && (
        <div className="hidden xl:grid xl:grid-cols-4 gap-4">
          {COLUMNS.map(col => {
            const cards = filteredInCol(col.key);
            const isOver = overCol === col.key;

            return (
              <div
                key={col.key}
                onDragOver={e => handleDragOver(e, col.key)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, col.key)}
                className={`rounded-xl border-2 flex flex-col transition-colors transition-transform transition-shadow duration-200 ${
                  isOver ? `${col.headerBg} border-dashed scale-[1.01] shadow-md` : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className={`px-4 py-3 rounded-t-xl border-b ${col.headerBg} flex items-center justify-between`}>
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    {col.label}
                    {col.locked && (
                      <span title="CEO/Admin decides this — see the Admin dashboard's CEO Approval Queue">
                        <Lock className="h-3 w-3 text-slate-400" />
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded-full h-5 w-5 flex items-center justify-center">
                    {cards.length}
                  </span>
                </div>

                <div className="flex-1 p-3 space-y-3 min-h-[220px]">
                  {cards.map(leave => (
                    <div
                      key={leave.id}
                      draggable
                      onDragStart={e => handleDragStart(e, leave.id)}
                      onDragEnd={() => setDragId(null)}
                      className={`bg-white rounded-lg border border-slate-200 p-3 shadow-sm cursor-grab active:cursor-grabbing transition-transform transition-shadow duration-200 select-none ${
                        dragId === leave.id ? 'opacity-40 scale-95' : 'hover:shadow-md hover:-translate-y-0.5'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="font-bold text-slate-900 text-sm leading-tight">{nameFor(leave.employeeName)}</div>
                        <GripVertical className="h-4 w-4 text-slate-300 flex-shrink-0 mt-0.5 hidden md:block" />
                      </div>
                      <LeaveTypeBadge type={leave.type} className="inline-block mb-2" />
                      <div className="text-[10px] font-semibold text-slate-500 mb-1.5 flex items-center gap-1"><Calendar className="h-3 w-3" /> {leave.duration}</div>
                      <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-2">{leave.reason}</p>

                    </div>
                  ))}
                  {cards.length === 0 && (
                    <div className={`h-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-8 transition-colors ${
                      isOver ? 'border-orange-400 bg-orange-50' : 'border-slate-200'
                    }`}>
                      <span className={`text-xs font-semibold ${isOver ? 'text-orange-600' : 'text-slate-400'}`}>
                        {isOver ? 'Drop here' : 'Empty'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── HISTORY VIEW ── */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Filters */}
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
                    <Th>Duration</Th>
                    <Th>Reason</Th>
                    <Th align="center">Status</Th>
                    <Th align="center">Action</Th>
                  </tr>
                </THead>
                <TBody>
{leavesLoading ? (
  <TableSkeletonRows rows={6} cols={6} />
) : (
<>
                  {historyLeaves.map(l => (
                    <Tr key={l.id}>
                      <Td density="cozy" className="font-semibold text-slate-900">{nameFor(l.employeeName)}</Td>
                      <Td density="cozy">
                        <LeaveTypeBadge type={l.type} />
                      </Td>
                      <Td density="cozy" className="text-slate-600 font-medium text-xs">{l.duration}</Td>
                      <Td density="cozy" className="text-slate-500 text-xs max-w-[200px] truncate">{l.reason}</Td>
                      <Td align="center" density="cozy">
                        <LeaveStatusBadge status={l.status} />
                      </Td>
                      <Td align="center" density="cozy">
                        {l.status === 'pending' && (
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleSendToCEO(l)}
                              disabled={processingLeaveId !== null}
                              className="text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded transition-colors transition-transform active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
                            >{processingLeaveId === l.id && <Loader2 className="h-3 w-3 animate-spin" />}Send to CEO</button>
                            <button
                              onClick={() => handleHistoryReject(l)}
                              disabled={processingLeaveId !== null}
                              className="text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded transition-colors transition-transform active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
                            >{processingLeaveId === l.id && <Loader2 className="h-3 w-3 animate-spin" />}Reject</button>
                          </div>
                        )}
                        {l.status === 'rejected' && (
                          <button
                            onClick={() => handleReopenLeave(l)}
                            disabled={processingLeaveId !== null}
                            className="text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded transition-colors transition-transform active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
                          >{processingLeaveId === l.id && <Loader2 className="h-3 w-3 animate-spin" />}Re-open</button>
                        )}
                        {(l.status === 'approved' || l.status === 'hr_approved') && (
                          <span className="text-xs text-slate-400 font-medium">—</span>
                        )}
                      </Td>
                    </Tr>
                  ))}
                  {historyLeaves.length === 0 && (
                    <Tr>
                      <EmptyState as="td" colSpan={6} py={12} size="sm">
                        No records match your filters.
                      </EmptyState>
                    </Tr>
                  )}
                </>
)}
</TBody>
              </Table>
            </TableScroll>

            {/* Mobile card stack */}
            <div className="md:hidden space-y-3 p-4">
              {historyLeaves.map(l => (
                <div key={l.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900 truncate pr-2">{nameFor(l.employeeName)}</p>
                    <LeaveStatusBadge status={l.status} className="shrink-0" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">Type</p>
                      <LeaveTypeBadge type={l.type} className="inline-block" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">Duration</p>
                      <p className="text-xs font-semibold text-slate-700">{l.duration}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">Reason</p>
                      <p className="text-xs font-medium text-slate-600 line-clamp-2">{l.reason}</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex justify-end gap-2">
                    {l.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleSendToCEO(l)}
                          disabled={processingLeaveId !== null}
                          className="flex-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 py-2 rounded-lg transition-colors transition-transform active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                        >{processingLeaveId === l.id && <Loader2 className="h-3 w-3 animate-spin" />}Send to CEO</button>
                        <button
                          onClick={() => handleHistoryReject(l)}
                          disabled={processingLeaveId !== null}
                          className="flex-1 text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 py-2 rounded-lg transition-colors transition-transform active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                        >{processingLeaveId === l.id && <Loader2 className="h-3 w-3 animate-spin" />}Reject</button>
                      </>
                    )}
                    {l.status === 'rejected' && (
                      <button
                        onClick={() => handleReopenLeave(l)}
                        disabled={processingLeaveId !== null}
                        className="w-full text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 py-2 rounded-lg transition-colors transition-transform active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                      >{processingLeaveId === l.id && <Loader2 className="h-3 w-3 animate-spin" />}Re-open</button>
                    )}
                    {(l.status === 'approved' || l.status === 'hr_approved') && (
                      <span className="text-[10px] text-slate-400 font-medium w-full text-center py-1">—</span>
                    )}
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
