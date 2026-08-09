'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { OrgCalendar } from '@/components/ui/OrgCalendar';
import { TaskModal } from '@/components/ui/TaskModal';
import { DollarSign, TrendingUp, Users, Clock, ClipboardList, CheckCircle2, AlertTriangle, PlusCircle, Loader2, Trash2, Eye, Video } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useProfiles, useLeaves, useTasks, useAnnouncements, useWarehouses, usePayroll, useTimesheets, hrActions, formatMoney, Profile, displayName, buildNotificationLink } from '@/lib/hrData';
import { AvgHoursWorkedCard } from '@/components/ui/AvgHoursWorkedCard';
import { MaintenanceNoticeManager } from '@/components/ui/MaintenanceNoticeManager';
import { ScheduleMeetModal } from '@/components/ui/ScheduleMeetModal';

export default function AdminDashboard() {
  const router = useRouter();
  const { data: employees = [], isLoading: isEmployeesLoading } = useProfiles();
  const { data: leaves = [], isLoading: isLeavesLoading, refetch: refetchLeaves } = useLeaves();
  const { data: payrollRecords = [] } = usePayroll();
  const { data: tasks = [], refetch: refetchTasks } = useTasks();
  const { data: timesheets = [], isLoading: isTimesheetsLoading } = useTimesheets();

  // LeaveApplication only snapshots a fullName, not a live Profile reference.
  const nameFor = (employeeName: string): string => {
    const emp = employees.find((e: Profile) => e.fullName === employeeName);
    return emp ? displayName(emp, 'admin') : employeeName;
  };
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [isScheduleMeetOpen, setIsScheduleMeetOpen] = useState(false);

  const { data: announcements = [], refetch: refetchAnnouncements } = useAnnouncements();
  const { data: warehouses = [] } = useWarehouses();
  const [isAnnounceOpen, setIsAnnounceOpen] = useState(false);

  // Announcement form states
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annTargetType, setAnnTargetType] = useState<'all' | 'usa' | 'pakistan' | 'warehouses'>('all');
  const [annSelectedWarehouses, setAnnSelectedWarehouses] = useState<string[]>([]);
  // Important announcements get a blocking popup in front of every targeted
  // employee (see AnnouncementPopup.tsx) instead of just sitting quietly in
  // the passive "Recent Announcements" feed — reserve this for things that
  // actually need a forced acknowledgment, not routine updates.
  const [annImportant, setAnnImportant] = useState(false);
  const [annSuccess, setAnnSuccess] = useState('');
  const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false);
  const [deletingAnnId, setDeletingAnnId] = useState<string | null>(null);
  const [processingLeaveId, setProcessingLeaveId] = useState<string | null>(null);

  // "Viewed by" facepile + modal — see hrActions.getAnnouncementReadMap in
  // hrData.ts (same per-announcement read-tracking store the Employee
  // dashboard's unread-highlight feature uses). Fetched once on mount for
  // the facepile, and refetched fresh whenever the viewers modal is opened
  // so the full list isn't showing stale data from whenever the page
  // happened to load.
  const [announcementReadMap, setAnnouncementReadMap] = useState<Record<string, string[]>>({});
  const [viewersAnnId, setViewersAnnId] = useState<string | null>(null);
  const viewersForAnnouncement = (annId: string): Profile[] => {
    const emails = (announcementReadMap[annId] || []).map(e => e.toLowerCase());
    return employees.filter((e: Profile) => emails.includes(e.email.toLowerCase()));
  };

  useEffect(() => {
    hrActions.getAnnouncementReadMap().then(setAnnouncementReadMap);
  }, [announcements.length]);

  const openViewersModal = (annId: string) => {
    setViewersAnnId(annId);
    hrActions.getAnnouncementReadMap().then(setAnnouncementReadMap);
  };

  useEffect(() => {
    // Monthly screenshot retention sweep — no-ops if already checked this
    // month or nothing is due; see checkScreenshotRetention in hrData.ts.
    hrActions.checkScreenshotRetention();
  }, []);

  // Same no-call-no-show / inactivity auto-absence check as hr/page.tsx —
  // safe to run from both HR's and Admin's dashboards (whichever loads with
  // real data first "wins"; runAbsenceCheck only ever creates NEW records
  // for employee+date combinations not already decided, so calling it from
  // both pages is a no-op the second time).
  useEffect(() => {
    if (isEmployeesLoading || isTimesheetsLoading || isLeavesLoading || employees.length === 0) return;
    hrActions.getInactivityLogs({ sinceISO: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString() })
      .then(inactivityLogs => hrActions.runAbsenceCheck(employees, timesheets, leaves, inactivityLogs))
      .catch(() => { /* best-effort */ });
  }, [employees.length, timesheets.length, leaves.length, isEmployeesLoading, isTimesheetsLoading, isLeavesLoading]);

  const handleAnnouncementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPostingAnnouncement || !annTitle.trim() || !annContent.trim()) return;

    setIsPostingAnnouncement(true);
    try {
      const targetVal = annTargetType === 'warehouses' ? annSelectedWarehouses : annTargetType;
      await hrActions.addAnnouncement(annTitle, annContent, targetVal, 'CEO Admin', annImportant);
      refetchAnnouncements();
      setAnnSuccess('Announcement posted successfully!');

      setTimeout(() => {
        setIsAnnounceOpen(false);
        setAnnTitle('');
        setAnnContent('');
        setAnnTargetType('all');
        setAnnSelectedWarehouses([]);
        setAnnImportant(false);
        setAnnSuccess('');
      }, 1200);
    } finally {
      setIsPostingAnnouncement(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (deletingAnnId) return;
    if (!window.confirm('Delete this announcement? This cannot be undone, and it will disappear from every employee\'s dashboard immediately.')) return;
    setDeletingAnnId(id);
    try {
      await hrActions.deleteAnnouncement(id);
      refetchAnnouncements();
    } finally {
      setDeletingAnnId(null);
    }
  };

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
          await hrActions.addNotification(emp.email, 'employee', `Your leave (${l.duration.split(' - ')[0]}) was ${action === 'approve' ? 'approved' : 'rejected'} by CEO.`, 'leave_task', action === 'approve' ? 'Leave Approved' : 'Leave Rejected', undefined, buildNotificationLink('employee', 'leave', l.id));
        }
        await hrActions.addNotification('all', 'hr', `CEO ${action === 'approve' ? 'approved' : 'rejected'} leave for ${l.employeeName}.`, 'leave_task', `${l.employeeName}'s Leave`, undefined, buildNotificationLink('hr', 'leave', l.id));
      }

      refetchLeaves();
    } finally {
      setProcessingLeaveId(null);
    }
  };

  // Derived stats — USA (USD) and Pakistan (PKR) salaries must never be
  // summed into a single number, so this stays split by currency.
  // Uses the exact same computation as the Payroll & Salary page (base
  // salary + bonus - deductions, employee/team_lead roles only) so the two
  // pages never disagree — previously this summed raw baseSalary across
  // every profile (including HR/Admin) with no bonus/deduction adjustment,
  // which didn't match the real payroll totals.
  const compiledPayroll = hrActions.computePayrollView(employees, payrollRecords, leaves);
  const totalPayrollUSD = compiledPayroll
    .filter(emp => emp.region === 'USA')
    .reduce((acc, emp) => acc + (emp.baseSalary + emp.bonus - emp.deductions), 0);
  const totalPayrollPKR = compiledPayroll
    .filter(emp => emp.region !== 'USA')
    .reduce((acc, emp) => acc + (emp.baseSalary + emp.bonus - emp.deductions), 0);
  const hrApprovedLeaves = leaves.filter(l => l.status === 'hr_approved');

  return (
    <div className="space-y-6 px-4 py-4 md:px-0 md:py-0 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-slate-900">Admin Overview</h1>
          <p className="text-xs md:text-sm text-slate-500">High-level metrics, leave approvals, and organisation calendar.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => router.push('/admin/tasks')}
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-4 py-2.5 md:py-2 rounded-lg text-xs md:text-sm active:scale-97 transition-colors transition-transform transition-shadow min-h-[44px] md:min-h-0"
          >
            View All Tasks
          </button>
          <button
            onClick={() => setIsScheduleMeetOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 md:py-2 rounded-lg text-xs md:text-sm active:scale-97 transition-colors transition-transform transition-shadow flex items-center gap-1.5 shadow-sm min-h-[44px] md:min-h-0"
          >
            <Video className="h-4 w-4" /> Schedule Google Meet
          </button>
          <button
            onClick={() => setIsAnnounceOpen(true)}
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-4 py-2.5 md:py-2 rounded-lg text-xs md:text-sm active:scale-97 transition-colors transition-transform transition-shadow flex items-center gap-1.5 min-h-[44px] md:min-h-0"
          >
            <PlusCircle className="h-4 w-4" /> Post Announcement
          </button>
          <button
            onClick={() => setIsTaskOpen(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-2.5 md:py-2 rounded-lg text-xs md:text-sm active:scale-97 transition-colors transition-transform transition-shadow flex items-center gap-1.5 shadow-sm min-h-[44px] md:min-h-0"
          >
            <ClipboardList className="h-4 w-4" /> Assign Task
          </button>
        </div>
      </div>

      {/* Stats — icon colors now semantically consistent: emerald=money,
          indigo=people, amber=time-sensitive, rose=risk. The "Total
          Employees" tile used to be an arbitrary Tailwind blue that matched
          nothing else in the system; indigo is DESIGN.md's actual
          documented secondary accent. */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card>
          <CardContent className="pt-4 md:pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] md:text-xs font-semibold text-slate-500">Monthly Payroll</p>
                <p className="text-sm md:text-lg font-bold text-slate-900 mt-1">{formatMoney(totalPayrollUSD, 'USA')}</p>
                <p className="text-[10px] md:text-xs font-semibold text-slate-500">{formatMoney(totalPayrollPKR, 'Pakistan')}</p>
              </div>
              <div className="h-10 w-10 md:h-11 md:w-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                <DollarSign className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          onClick={() => router.push('/hr/teams')}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push('/hr/teams'); } }}
          className="cursor-pointer"
        >
          <CardContent className="pt-4 md:pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] md:text-xs font-semibold text-slate-500">Total Employees</p>
                <p className="text-base md:text-2xl font-bold text-slate-900 mt-1">{employees.length}</p>
              </div>
              <div className="h-10 w-10 md:h-11 md:w-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          onClick={() => router.push('/admin/leaves')}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push('/admin/leaves'); } }}
          className="cursor-pointer"
        >
          <CardContent className="pt-4 md:pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] md:text-xs font-semibold text-slate-500">Awaiting CEO Approval</p>
                <p className="text-base md:text-2xl font-bold text-slate-900 mt-1">{hrApprovedLeaves.length}</p>
              </div>
              <div className="h-10 w-10 md:h-11 md:w-11 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                <Clock className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <AvgHoursWorkedCard employees={employees} timesheets={timesheets} viewerRole="admin" />
      </div>

      {/* CEO Leave Approval Queue — moved up to directly follow the stats.
          This is the one thing on this page that actually requires the
          CEO/Admin to DO something; it used to be the last section on the
          page, below two purely informational widgets (calendar,
          announcements), which buries the actionable item under passive
          content — the same "primary action demoted below status noise"
          problem fixed on the Employee dashboard. */}
      <div className="space-y-3">
        <h2 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
          Pending CEO Approval
          {hrApprovedLeaves.length > 0 && (
            <span className="bg-amber-100 text-amber-800 font-bold text-[10px] px-2 py-0.5 rounded-full">{hrApprovedLeaves.length} pending</span>
          )}
        </h2>

        <Card className="overflow-hidden p-0 border border-slate-200">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
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
                {hrApprovedLeaves.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-900">{nameFor(l.employeeName)}</td>
                    <td className="px-6 py-4">{l.type}</td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{l.duration}</td>
                    <td className="px-6 py-4 text-slate-500 max-w-xs truncate">{l.reason}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => handleCEOAction(l.id, 'approve')} disabled={processingLeaveId !== null} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded transition-colors transition-transform transition-shadow active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1">
                          {processingLeaveId === l.id && <Loader2 className="h-3 w-3 animate-spin" />} CEO Approve
                        </button>
                        <button onClick={() => handleCEOAction(l.id, 'reject')} disabled={processingLeaveId !== null} className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded transition-colors transition-transform transition-shadow active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1">
                          {processingLeaveId === l.id && <Loader2 className="h-3 w-3 animate-spin" />} Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {hrApprovedLeaves.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400 font-semibold italic text-sm">
                      No pending approvals — all leaves are processed.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile card stack */}
          <div className="md:hidden">
            {hrApprovedLeaves.length === 0 ? (
              <p className="py-10 text-center text-slate-400 font-semibold italic text-sm">No pending approvals — all leaves are processed.</p>
            ) : (
              <div className="space-y-3 p-4">
                {hrApprovedLeaves.map(l => (
                  <div key={l.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-900">{nameFor(l.employeeName)}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">{l.type}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-slate-400 font-semibold uppercase">Dates</p>
                        <p className="text-xs font-bold text-slate-800">{l.duration}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-semibold uppercase">Reason</p>
                        <p className="text-xs font-bold text-slate-800 truncate">{l.reason}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => handleCEOAction(l.id, 'approve')} disabled={processingLeaveId !== null} className="flex-1 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 py-2.5 rounded-lg transition-colors transition-transform transition-shadow active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1">
                        {processingLeaveId === l.id && <Loader2 className="h-3 w-3 animate-spin" />} CEO Approve
                      </button>
                      <button onClick={() => handleCEOAction(l.id, 'reject')} disabled={processingLeaveId !== null} className="flex-1 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 py-2.5 rounded-lg transition-colors transition-transform transition-shadow active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1">
                        {processingLeaveId === l.id && <Loader2 className="h-3 w-3 animate-spin" />} Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Org Calendar */}
      <Card className="p-0">
        <div className="px-4 md:px-6 pt-5 pb-2 border-b border-slate-100">
          <h2 className="text-sm md:text-base font-bold text-slate-900">Organisation Calendar</h2>
          <p className="text-xs text-slate-500 mt-0.5">Leave schedules, task deadlines, and conflict indicators across all departments.</p>
        </div>
        <div className="p-4 md:p-6">
          <OrgCalendar leaves={leaves as any} tasks={tasks as any} employees={employees} />
        </div>
      </Card>

      {/* Announcements Panel — rows are a plain divided list now, not each
          wrapped in its own nested bordered/tinted box inside the Card. */}
      <Card className="p-0">
        <div className="px-4 md:px-6 pt-5 pb-2 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-sm md:text-base font-bold text-slate-900">Recent Announcements</h2>
            <p className="text-xs text-slate-500 mt-0.5">Corporate updates and targeted broadcast messages.</p>
          </div>
        </div>
        <CardContent className="p-0 divide-y divide-slate-100">
          {announcements.map(ann => (
            <div key={ann.id} className="p-4 md:px-6 flex flex-col justify-between">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-slate-900 text-sm">{ann.title}</h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed whitespace-pre-wrap break-words">{ann.content}</p>
                </div>
                <div className="flex items-center gap-2 self-start shrink-0">
                  {ann.important && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-800 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      <AlertTriangle className="h-3 w-3" /> Important
                    </span>
                  )}
                  <Badge variant={ann.target === 'all' ? 'default' : 'warning'}>
                    Target: {Array.isArray(ann.target)
                      ? `Warehouses (${ann.target.map((tId: string) => warehouses.find(w => w.id === tId)?.name || tId).join(', ')})`
                      : ann.target.toUpperCase()}
                  </Badge>
                  <button
                    onClick={() => handleDeleteAnnouncement(ann.id)}
                    disabled={deletingAnnId === ann.id}
                    title="Delete announcement"
                    className="h-6 w-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
                  >
                    {deletingAnnId === ann.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold mt-3 pt-2 border-t border-slate-100">
                <span>By {ann.createdBy}</span>
                <span>{ann.timestamp}</span>
              </div>
              {/* "Viewed by" facepile — see hrActions.getAnnouncementReadMap
                  in hrData.ts, the same per-announcement read-tracking
                  store the Employee dashboard's unread-highlight feature
                  writes to. Clicking opens the full viewer list modal. */}
              {(() => {
                const viewers = viewersForAnnouncement(ann.id);
                return (
                  <button
                    onClick={() => openViewersModal(ann.id)}
                    className="flex items-center gap-2 mt-2.5 group self-start"
                    title="See who has viewed this announcement"
                  >
                    <div className="flex -space-x-2">
                      {viewers.length === 0 ? (
                        <span className="h-[22px] w-[22px] rounded-full border border-dashed border-slate-300 flex items-center justify-center">
                          <Eye className="h-3 w-3 text-slate-300" />
                        </span>
                      ) : (
                        viewers.slice(0, 5).map(v => (
                          <Avatar key={v.id} src={v.profilePicture} name={displayName(v, 'admin')} size={22} className="ring-2 ring-white" />
                        ))
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 group-hover:text-orange-600 transition-colors">
                      {viewers.length === 0 ? 'No views yet' : `${viewers.length} viewed${viewers.length > 5 ? ` (+${viewers.length - 5} more)` : ''}`}
                    </span>
                  </button>
                );
              })()}
            </div>
          ))}
          {announcements.length === 0 && (
            <p className="text-xs text-slate-400 font-semibold italic text-center py-4">No announcements posted yet.</p>
          )}
        </CardContent>
      </Card>

      <MaintenanceNoticeManager createdBy="CEO Admin" />

      {/* Announcement Viewers Modal — lists everyone who has seen the
          selected announcement (see hrActions.getAnnouncementReadMap). */}
      <Modal
        isOpen={!!viewersAnnId}
        onClose={() => setViewersAnnId(null)}
        title={viewersAnnId ? `Viewed by (${viewersForAnnouncement(viewersAnnId).length})` : 'Viewed by'}
      >
        {viewersAnnId && (() => {
          const viewers = viewersForAnnouncement(viewersAnnId);
          return viewers.length === 0 ? (
            <p className="text-xs text-slate-400 font-semibold italic text-center py-6">No one has viewed this announcement yet.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {viewers.map(v => (
                <div key={v.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
                  <Avatar src={v.profilePicture} name={displayName(v, 'admin')} size={36} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{displayName(v, 'admin')}</p>
                    <p className="text-xs text-slate-400 truncate">{v.email}</p>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </Modal>

      {/* Announcement Modal */}
      <Modal isOpen={isAnnounceOpen} onClose={() => setIsAnnounceOpen(false)} title="Create New Announcement">
        <form onSubmit={handleAnnouncementSubmit} className="space-y-4 pt-1">
          {annSuccess && (
            <div className="p-3 text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> {annSuccess}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Announcement Title *</label>
            <input 
              type="text" 
              required 
              value={annTitle} 
              onChange={e => setAnnTitle(e.target.value)} 
              className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors transition-transform transition-shadow focus:ring-2 focus:ring-orange-100 font-semibold" 
              placeholder="e.g. System Maintenance Notice" 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Content *</label>
            <textarea 
              required 
              rows={4} 
              value={annContent} 
              onChange={e => setAnnContent(e.target.value)} 
              className="w-full bg-slate-50/50 hover:bg-slate-100 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors transition-transform transition-shadow focus:ring-2 focus:ring-orange-100 font-semibold resize-none" 
              placeholder="Type announcement details here..." 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Target Audience *</label>
            <select
              value={annTargetType}
              onChange={e => setAnnTargetType(e.target.value as any)}
              className="w-full bg-slate-50/50 hover:bg-slate-100 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors transition-transform transition-shadow focus:ring-2 focus:ring-orange-100 font-semibold cursor-pointer"
            >
              <option value="all">All Employees</option>
              <option value="usa">USA Employees Only</option>
              <option value="pakistan">Pakistani Employees (Remote) Only</option>
              <option value="warehouses">Specific Warehouses</option>
            </select>
          </div>

          {annTargetType === 'warehouses' && (
            <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-xl max-h-36 overflow-y-auto">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Select Warehouses</label>
              <div className="space-y-1.5">
                {warehouses.map(wh => (
                  <label key={wh.id} className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={annSelectedWarehouses.includes(wh.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setAnnSelectedWarehouses(prev => [...prev, wh.id]);
                        } else {
                          setAnnSelectedWarehouses(prev => prev.filter(id => id !== wh.id));
                        }
                      }}
                      className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                    />
                    {wh.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={annImportant}
              onChange={e => setAnnImportant(e.target.checked)}
              className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-xs">
              <span className="font-bold text-amber-900 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Mark as Important</span>
              <span className="block text-amber-700 font-medium mt-0.5">
                Every targeted employee gets a popup they must explicitly mark as read — it reappears on every login or page refresh until they do.
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" disabled={isPostingAnnouncement} onClick={() => setIsAnnounceOpen(false)} className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 font-bold px-4 py-2.5 md:py-2 rounded-xl text-xs active:scale-97 transition-colors transition-transform transition-shadow disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
            <button type="submit" disabled={isPostingAnnouncement} className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2.5 md:py-2 rounded-xl text-xs active:scale-97 transition-colors transition-transform transition-shadow shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
              {isPostingAnnouncement && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isPostingAnnouncement ? 'Posting…' : 'Post Announcement'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Task Modal */}
      <TaskModal
        isOpen={isTaskOpen}
        onClose={() => setIsTaskOpen(false)}
        employees={employees.filter(e => e.role === 'employee' || e.isTeamLead)}
        createdBy="admin"
        onTaskAdded={() => refetchTasks()}
      />

      {/* Schedule Google Meet Modal */}
      <ScheduleMeetModal
        isOpen={isScheduleMeetOpen}
        onClose={() => setIsScheduleMeetOpen(false)}
      />
    </div>
  );
}
