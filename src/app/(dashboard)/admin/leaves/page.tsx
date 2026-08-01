'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CheckCircle2, ShieldCheck, List, Loader2 } from 'lucide-react';
import { useLeaves, useProfiles, hrActions, LeaveApplication, Profile, displayName, buildNotificationLink } from '@/lib/hrData';

const TYPE_COLORS: Record<string, string> = {
  'PTO': 'bg-indigo-100 text-indigo-800',
  'Sick Leave': 'bg-amber-100 text-amber-800',
  'Urgent': 'bg-rose-100 text-rose-800',
};

const STATUS_BADGE_MAP: Record<LeaveApplication['status'], { variant: 'success' | 'warning' | 'danger' | 'default'; label: string }> = {
  pending:     { variant: 'warning', label: 'Pending'      },
  hr_approved: { variant: 'default', label: 'HR Approved'  },
  approved:    { variant: 'success', label: 'CEO Approved' },
  rejected:    { variant: 'danger',  label: 'Rejected'     },
};

type TabView = 'queue' | 'history';

export default function AdminLeavesPage() {
  const { data: leaves = [], refetch: refetchLeaves } = useLeaves();
  const { data: employees = [] } = useProfiles();
  const [searchQuery, setSearchQuery] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [activeTab, setActiveTab] = useState<TabView>('queue');
  const [histFilter, setHistFilter] = useState<LeaveApplication['status'] | 'all'>('all');

  // See the matching comment in hr/leaves/page.tsx — LeaveApplication only
  // snapshots a fullName, not a live Profile reference.
  const nameFor = (employeeName: string): string => {
    const emp = employees.find((e: Profile) => e.fullName === employeeName);
    return emp ? displayName(emp, 'admin') : employeeName;
  };
  const [histType, setHistType] = useState<'all' | 'PTO' | 'Sick Leave' | 'Urgent'>('all');
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
      setSuccessMsg(`Leave ${action === 'approve' ? 'approved' : 'rejected'} by CEO!`);
      setTimeout(() => setSuccessMsg(''), 1500);
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
        {successMsg && (
          <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 fade-enter shadow-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />{successMsg}
          </div>
        )}
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
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('queue')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
            activeTab === 'queue'
              ? 'border-orange-500 text-orange-700 bg-orange-50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="h-4 w-4" /> CEO Approval Queue
          {stats.hrApproved > 0 && (
            <span className="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{stats.hrApproved}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-orange-500 text-orange-700 bg-orange-50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <List className="h-4 w-4" /> Full History
        </button>
      </div>

      {/* ── CEO QUEUE TAB ── */}
      {activeTab === 'queue' && (
        <Card className="overflow-hidden p-0 border border-slate-200">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[750px] text-sm text-left border-collapse">
              <thead className="text-xs font-bold text-slate-600 bg-slate-50 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Employee</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Dates</th>
                  <th className="px-6 py-4">Reason</th>
                  <th className="px-6 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pendingCEOLeaves.map(leave => (
                  <tr key={leave.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-900">{nameFor(leave.employeeName)}</td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TYPE_COLORS[leave.type] || ''}`}>{leave.type}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium text-xs">{leave.duration}</td>
                    <td className="px-6 py-4 text-slate-500 max-w-xs truncate text-xs">{leave.reason}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => handleCEOAction(leave.id, 'approve')} disabled={processingLeaveId !== null} className="text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded transition-colors transition-transform active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1">
                          {processingLeaveId === leave.id && <Loader2 className="h-3 w-3 animate-spin" />} CEO Approve
                        </button>
                        <button onClick={() => handleCEOAction(leave.id, 'reject')} disabled={processingLeaveId !== null} className="text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded transition-colors transition-transform active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1">
                          {processingLeaveId === leave.id && <Loader2 className="h-3 w-3 animate-spin" />} Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pendingCEOLeaves.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-slate-400 font-semibold italic text-sm">
                      No leaves waiting for CEO approval.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="md:hidden space-y-3 p-4">
            {pendingCEOLeaves.map(leave => (
              <div key={leave.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-900">{nameFor(leave.employeeName)}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TYPE_COLORS[leave.type] || ''}`}>{leave.type}</span>
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
            {pendingCEOLeaves.length === 0 && (
              <p className="py-8 text-center text-slate-400 font-semibold italic text-sm">
                No leaves waiting for CEO approval.
              </p>
            )}
          </div>
        </Card>
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === 'history' && (
        <div className="space-y-4">
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
                    <th className="px-5 py-4">Dates</th>
                    <th className="px-5 py-4">Reason</th>
                    <th className="px-5 py-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyLeaves.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-slate-900">{nameFor(l.employeeName)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TYPE_COLORS[l.type] || 'bg-slate-100 text-slate-600'}`}>{l.type}</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 font-medium text-xs">{l.duration}</td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs max-w-[200px] truncate">{l.reason}</td>
                      <td className="px-5 py-3.5 text-center">
                        <Badge variant={STATUS_BADGE_MAP[l.status].variant}>{STATUS_BADGE_MAP[l.status].label}</Badge>
                      </td>
                    </tr>
                  ))}
                  {historyLeaves.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-slate-400 font-semibold italic text-sm">
                        No records match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3 p-4">
              {historyLeaves.map(l => (
                <div key={l.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900">{nameFor(l.employeeName)}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TYPE_COLORS[l.type] || 'bg-slate-100 text-slate-600'}`}>{l.type}</span>
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
                    <Badge variant={STATUS_BADGE_MAP[l.status].variant}>{STATUS_BADGE_MAP[l.status].label}</Badge>
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
