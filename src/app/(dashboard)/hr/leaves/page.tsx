'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { hrActions, LeaveApplication, Profile, useLeaves, useProfiles, displayName, buildNotificationLink } from '@/lib/hrData';
import { CheckCircle2, GripVertical, Clock, XCircle, BarChart3, List, Download, Lock, Calendar, Loader2 } from 'lucide-react';

const COLUMNS: { key: LeaveApplication['status']; label: string; headerBg: string; locked?: boolean }[] = [
  { key: 'pending',     label: 'Pending Review',       headerBg: 'bg-amber-50 border-amber-200'   },
  { key: 'hr_approved', label: 'HR Approved → CEO',    headerBg: 'bg-indigo-50 border-indigo-200' },
  // Dropping here is blocked in handleDrop — final approval is a CEO/Admin
  // decision made from the Admin dashboard's CEO Approval Queue, not
  // something HR grants by dragging a card on their own board.
  { key: 'approved',    label: 'CEO Approved',         headerBg: 'bg-emerald-50 border-emerald-200', locked: true },
  { key: 'rejected',    label: 'Rejected (Re-open ↩)', headerBg: 'bg-rose-50 border-rose-200'     },
];

const TYPE_COLORS: Record<string, string> = {
  'PTO': 'bg-indigo-100 text-indigo-800',
  'Sick Leave': 'bg-amber-100 text-amber-800',
  'Urgent': 'bg-rose-100 text-rose-800',
};

const STATUS_BADGE: Record<LeaveApplication['status'], { variant: string; label: string }> = {
  pending:     { variant: 'warning', label: 'Pending'      },
  hr_approved: { variant: 'default', label: 'HR Approved'  },
  approved:    { variant: 'success', label: 'CEO Approved' },
  rejected:    { variant: 'danger',  label: 'Rejected'     },
};

type TabView = 'kanban' | 'history';

export default function HRLeavesPage() {
  const { data: leaves = [], refetch: refetchLeaves } = useLeaves();
  const { data: employees = [] } = useProfiles();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<LeaveApplication['status'] | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
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
  const [histType, setHistType] = useState<'all' | 'PTO' | 'Sick Leave' | 'Urgent'>('all');
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
      setSuccessMsg('Sent to CEO!');
      setTimeout(() => setSuccessMsg(''), 1500);
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
      setSuccessMsg('Rejected!');
      setTimeout(() => setSuccessMsg(''), 1500);
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
      setSuccessMsg('Re-opened for review!');
      setTimeout(() => setSuccessMsg(''), 1500);
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
    if (leaf.status === targetStatus) return;

    // Final approval is a CEO/Admin-only decision (see admin/leaves page's
    // CEO Approval Queue) — HR forwards a request, they don't get to grant
    // "CEO Approved" themselves just by dragging a card. Previously nothing
    // stopped HR from dropping straight into this column, which silently
    // fired the exact "fully approved" notification a real CEO decision
    // sends, even though the CEO never approved anything.
    if (targetStatus === 'approved') {
      setErrorMsg('Only Admin/CEO can grant final approval. Use "Send to CEO" — they\'ll approve or reject it from their dashboard.');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }
    // Once it's in the CEO's queue, rejecting it is also the CEO's call —
    // HR can still reject directly from "Pending" (before forwarding), just
    // not override a request that's already awaiting CEO review.
    if (targetStatus === 'rejected' && leaf.status === 'hr_approved') {
      setErrorMsg('This request is already with the CEO for review — only they can reject it now.');
      setTimeout(() => setErrorMsg(''), 3000);
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

    setSuccessMsg('Leave status updated!');
    setTimeout(() => setSuccessMsg(''), 1500);
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: LeaveApplication['status']) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    setDragId(null);
    setOverCol(null);
    if (!id) return;

    const leaf = leaves.find((l: any) => l.id === id);
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
        <button
          onClick={exportLeavesCSV}
          disabled={historyLeaves.length === 0}
          className="bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-200 text-slate-700 font-semibold px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
        {successMsg && (
          <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm fade-enter">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />{successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="bg-rose-50 text-rose-800 border border-rose-200 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm fade-enter max-w-sm">
            <XCircle className="h-4 w-4 text-rose-600 shrink-0" />{errorMsg}
          </div>
        )}
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
      <div className="flex gap-2 border-b border-slate-200 pb-0">
        <button
          onClick={() => setActiveTab('kanban')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
            activeTab === 'kanban'
              ? 'border-orange-500 text-orange-700 bg-orange-50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BarChart3 className="h-4 w-4" /> Kanban Board
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-orange-500 text-orange-700 bg-orange-50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <List className="h-4 w-4" /> History & Audit Log
        </button>
      </div>

      {/* ── KANBAN VIEW ── */}
      {activeTab === 'kanban' && (
        <div className="flex xl:grid xl:grid-cols-4 gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4 xl:mx-0 xl:px-0 scrollbar-hide">
          {COLUMNS.map(col => {
            const cards = filteredInCol(col.key);
            const isOver = overCol === col.key;

            return (
              <div
                key={col.key}
                onDragOver={e => handleDragOver(e, col.key)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, col.key)}
                className={`snap-center shrink-0 w-[85vw] sm:w-[45vw] xl:w-auto rounded-xl border-2 flex flex-col transition-colors transition-transform transition-shadow duration-200 ${
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
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-2 ${TYPE_COLORS[leave.type] || 'bg-slate-100 text-slate-700'}`}>
                        {leave.type}
                      </span>
                      <div className="text-[10px] font-semibold text-slate-500 mb-1.5 flex items-center gap-1"><Calendar className="h-3 w-3" /> {leave.duration}</div>
                      <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-2">{leave.reason}</p>

                      {/* Mobile-only status mover — native HTML5 drag-and-drop
                          never fires on touch devices at all (a hard browser
                          limitation, not a sizing bug), so dragging cards
                          between columns silently does nothing on phones.
                          This calls the exact same moveLeaveTo() path the
                          desktop drag-and-drop uses, giving touch users a
                          working equivalent action instead of a dead gesture. */}
                      <select
                        value={leave.status}
                        onChange={e => moveLeaveTo(leave, e.target.value as LeaveApplication['status'])}
                        onClick={e => e.stopPropagation()}
                        disabled={COLUMNS.find(c => c.key === leave.status)?.locked}
                        className="md:hidden mt-2.5 w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-[10px] font-bold text-slate-700 outline-none focus:border-orange-500 disabled:opacity-60"
                      >
                        {COLUMNS.filter(c => !c.locked || c.key === leave.status).map(c => (
                          <option key={c.key} value={c.key}>{c.label}</option>
                        ))}
                      </select>
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
            <select
              value={histFilter}
              onChange={e => setHistFilter(e.target.value as LeaveApplication['status'] | 'all')}
              className="bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="hr_approved">HR Approved</option>
              <option value="approved">CEO Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <select
              value={histType}
              onChange={e => setHistType(e.target.value as typeof histType)}
              className="bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900"
            >
              <option value="all">All Types</option>
              <option value="PTO">PTO</option>
              <option value="Sick Leave">Sick Leave</option>
              <option value="Urgent">Urgent</option>
            </select>
            <span className="text-xs text-slate-400 font-semibold self-center">{historyLeaves.length} records</span>
          </div>

          <Card className="overflow-hidden p-0 border border-slate-200">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[750px] text-sm text-left border-collapse">
                <thead className="text-xs font-bold text-slate-600 bg-slate-50 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-4">Employee</th>
                    <th className="px-5 py-4">Type</th>
                    <th className="px-5 py-4">Duration</th>
                    <th className="px-5 py-4">Reason</th>
                    <th className="px-5 py-4 text-center">Status</th>
                    <th className="px-5 py-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyLeaves.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-slate-900">{nameFor(l.employeeName)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TYPE_COLORS[l.type] || 'bg-slate-100 text-slate-700'}`}>{l.type}</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 font-medium text-xs">{l.duration}</td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs max-w-[200px] truncate">{l.reason}</td>
                      <td className="px-5 py-3.5 text-center">
                        <Badge variant={STATUS_BADGE[l.status].variant as 'success' | 'warning' | 'danger' | 'default'}>
                          {STATUS_BADGE[l.status].label}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-center">
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
                      </td>
                    </tr>
                  ))}
                  {historyLeaves.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-400 font-semibold italic text-sm">
                        No records match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile card stack */}
            <div className="md:hidden space-y-3 p-4">
              {historyLeaves.map(l => (
                <div key={l.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900 truncate pr-2">{nameFor(l.employeeName)}</p>
                    <Badge variant={STATUS_BADGE[l.status].variant as 'success' | 'warning' | 'danger' | 'default'} className="shrink-0">
                      {STATUS_BADGE[l.status].label}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">Type</p>
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${TYPE_COLORS[l.type] || 'bg-slate-100 text-slate-700'}`}>{l.type}</span>
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
              {historyLeaves.length === 0 && (
                <p className="py-8 text-center text-slate-400 font-semibold italic text-sm">
                  No records match your filters.
                </p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
