'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { OrgCalendar } from '@/components/ui/OrgCalendar';
import { TaskModal } from '@/components/ui/TaskModal';
import { Users, Clock, CheckCircle2, ClipboardList, PlusCircle, Loader2, Trash2, Eye, AlertTriangle, Video } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { hrActions, Profile, useProfiles, useLeaves, useTasks, useTeams, useAnnouncements, useWarehouses, useTimesheets, displayName } from '@/lib/hrData';
import { ActiveEmployeesCard } from '@/components/ui/ActiveEmployeesCard';
import { AvgHoursWorkedCard } from '@/components/ui/AvgHoursWorkedCard';
import { MaintenanceNoticeManager } from '@/components/ui/MaintenanceNoticeManager';
import { ScheduleMeetModal } from '@/components/ui/ScheduleMeetModal';

export default function HRDashboard() {
  const router = useRouter();

  // Data
  const { data: employees = [], isLoading: isEmployeesLoading, refetch: refetchProfiles } = useProfiles();
  const { data: leaves = [], isLoading: isLeavesLoading, refetch: refetchLeaves } = useLeaves();
  const { data: tasks = [], refetch: refetchTasks } = useTasks();
  const { data: teamsData = [], refetch: refetchTeams } = useTeams();
  const { data: timesheets = [], isLoading: isTimesheetsLoading } = useTimesheets();


  // LeaveApplication only snapshots a fullName, not a live Profile reference.
  const nameFor = (employeeName: string): string => {
    const emp = employees.find((e: Profile) => e.fullName === employeeName);
    return emp ? displayName(emp, 'hr') : employeeName;
  };
  const teams = teamsData.map(t => t.name); // extract names
  const { data: announcements = [], refetch: refetchAnnouncements } = useAnnouncements();
  const { data: warehouses = [], refetch: refetchWarehouses } = useWarehouses();
  
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [isScheduleMeetOpen, setIsScheduleMeetOpen] = useState(false);
  const [isTeamLeadOpen, setIsTeamLeadOpen] = useState(false);
  const [isOnboardOpen, setIsOnboardOpen] = useState(false);
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

  // "Viewed by" facepile + modal — see hrActions.getAnnouncementReadMap in
  // hrData.ts (same per-announcement read-tracking store the Employee
  // dashboard's unread-highlight feature uses).
  const [announcementReadMap, setAnnouncementReadMap] = useState<Record<string, string[]>>({});
  const [viewersAnnId, setViewersAnnId] = useState<string | null>(null);
  const viewersForAnnouncement = (annId: string): Profile[] => {
    const emails = (announcementReadMap[annId] || []).map(e => e.toLowerCase());
    return employees.filter((e: Profile) => emails.includes(e.email.toLowerCase()));
  };
  const openViewersModal = (annId: string) => {
    setViewersAnnId(annId);
    hrActions.getAnnouncementReadMap().then(setAnnouncementReadMap);
  };

  // Team Lead assignment form
  const [leadEmployeeId, setLeadEmployeeId] = useState('');
  const [leadTeamSelections, setLeadTeamSelections] = useState<string[]>([]);
  const [leadSuccess, setLeadSuccess] = useState('');

  // Onboard form
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('employee');
  const [salary, setSalary] = useState('');
  const [team, setTeam] = useState('Engineering');
  const [tempPassword, setTempPassword] = useState('');
  const [onboardError, setOnboardError] = useState('');
  const [onboardSuccess, setOnboardSuccess] = useState('');

  useEffect(() => {
    // Monthly screenshot retention sweep — no-ops if already checked this
    // month or nothing is due; see checkScreenshotRetention in hrData.ts.
    hrActions.checkScreenshotRetention();

    const handleSearch = (e: Event) => setSearchQuery((e as CustomEvent).detail || '');
    window.addEventListener('globalSearch', handleSearch);
    return () => window.removeEventListener('globalSearch', handleSearch);
  }, []);

  // No-call-no-show / inactivity auto-absence check — Pakistan-region
  // employees who haven't started a shift on a weekday (with no approved
  // leave), or who were inactive 35+ minutes during a shift, get marked
  // absent + a 2-days'-pay deduction that automatically shows up in payroll
  // (see AbsenceRecord/runAbsenceCheck/computePayrollView in hrData.ts).
  // This fires new notifications + creates the persisted AbsenceRecord the
  // moment HR's dashboard loads with real data — no-ops on every subsequent
  // load unless a new absence has actually occurred since the last check.
  useEffect(() => {
    if (isEmployeesLoading || isTimesheetsLoading || isLeavesLoading || employees.length === 0) return;
    hrActions.getInactivityLogs({ sinceISO: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString() })
      .then(inactivityLogs => hrActions.runAbsenceCheck(employees, timesheets, leaves, inactivityLogs))
      .catch(() => { /* best-effort */ });
  }, [employees.length, timesheets.length, leaves.length, isEmployeesLoading, isTimesheetsLoading, isLeavesLoading]);

  useEffect(() => {
    hrActions.getAnnouncementReadMap().then(setAnnouncementReadMap);
  }, [announcements.length]);

  const handleAnnouncementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annContent.trim() || isPostingAnnouncement) return;

    setIsPostingAnnouncement(true);
    try {
      const targetVal = annTargetType === 'warehouses' ? annSelectedWarehouses : annTargetType;
      await hrActions.addAnnouncement(annTitle, annContent, targetVal, 'HR Manager', annImportant);
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

  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardError('');
    if (!fullName || !email || !salary) { setOnboardError('Please fill in all required fields.'); return; }
    if (isNaN(Number(salary)) || Number(salary) <= 0) { setOnboardError('Please enter a valid base salary.'); return; }

    await hrActions.addEmployee({ fullName, email, role: role as Profile['role'], joinedDate: new Date().toISOString().split('T')[0], baseSalary: Number(salary), teams: [team], password: tempPassword || 'employee123' });
    await hrActions.addNotification('all', 'hr', `New employee ${fullName} (${role}) registered.`);
    await hrActions.addNotification('all', 'admin', `New employee ${fullName} (${role}) registered.`);
    setOnboardSuccess('Employee registered!');
    refetchProfiles();
    setTimeout(() => { setIsOnboardOpen(false); setFullName(''); setEmail(''); setSalary(''); setTempPassword(''); setOnboardSuccess(''); }, 1200);
  };

  const handleLeadToggle = (teamName: string) => {
    setLeadTeamSelections(prev =>
      prev.includes(teamName) ? prev.filter(t => t !== teamName) : [...prev, teamName]
    );
  };

  const handleSaveTeamLead = async () => {
    if (!leadEmployeeId) return;
    await hrActions.setTeamLead(leadEmployeeId, leadTeamSelections);
    refetchProfiles();
    const emp = employees.find((e: Profile) => e.id === leadEmployeeId);
    setLeadSuccess(`${emp?.fullName} is now team lead of: ${leadTeamSelections.join(', ') || '(none)'}`);
    setTimeout(() => { setIsTeamLeadOpen(false); setLeadSuccess(''); setLeadEmployeeId(''); setLeadTeamSelections([]); }, 1400);
  };

  // Stats
  const pendingLeaves = leaves.filter(l => l.status === 'pending').length;

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-slate-900">HR Dashboard</h1>
          <p className="text-xs md:text-sm text-slate-500">Overview, scheduling calendar, and team operations.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setIsScheduleMeetOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 md:py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform flex items-center gap-1.5 shadow-sm min-h-[44px] md:min-h-0"
          >
            <Video className="h-4 w-4" /> Schedule Google Meet
          </button>
          <button
            onClick={() => setIsAnnounceOpen(true)}
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-4 py-2.5 md:py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform flex items-center gap-1.5 min-h-[44px] md:min-h-0"
          >
            <PlusCircle className="h-4 w-4" /> Post Announcement
          </button>
          <button
            onClick={() => setIsTaskOpen(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-2.5 md:py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform flex items-center gap-1.5 shadow-sm min-h-[44px] md:min-h-0"
          >
            <ClipboardList className="h-4 w-4" /> Assign Task
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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
                <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">{employees.length}</p>
              </div>
              <div className="h-10 w-10 md:h-11 md:w-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Users className="h-4 w-4 md:h-5 md:w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          onClick={() => router.push('/hr/leaves')}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push('/hr/leaves'); } }}
          className="cursor-pointer"
        >
          <CardContent className="pt-4 md:pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] md:text-xs font-semibold text-slate-500">Pending Leaves</p>
                <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">{pendingLeaves}</p>
              </div>
              <div className="h-10 w-10 md:h-11 md:w-11 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                <Clock className="h-4 w-4 md:h-5 md:w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <AvgHoursWorkedCard employees={employees} timesheets={timesheets} viewerRole="hr" />
        <ActiveEmployeesCard employees={employees} timesheets={timesheets} viewerRole="hr" />
      </div>

      {/* Pending Leave Requests — the primary actionable item for HR, surfaced
          immediately after stats rather than buried below passive widgets. */}
      <Card className="p-0">
        <div className="px-4 md:px-6 pt-4 md:pt-5 pb-2 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-sm md:text-base font-bold text-slate-900">Pending Leave Requests</h2>
            <p className="text-[10px] md:text-xs text-slate-500 mt-0.5">Requests awaiting your decision.</p>
          </div>
          <button
            onClick={() => router.push('/hr/leaves')}
            className="text-xs font-semibold text-orange-600 hover:text-orange-700 shrink-0"
          >
            Full Kanban board →
          </button>
        </div>
        <CardContent className="p-0 divide-y divide-slate-100">
          {leaves.filter(l => l.status === 'pending').slice(0, 5).map(l => (
            <div key={l.id} className="p-4 md:px-6 flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-slate-900 text-sm">{nameFor(l.employeeName)}</div>
                <div className="text-xs text-slate-500 mt-0.5">{l.type} · {l.duration}</div>
              </div>
              <Badge variant="warning">Pending</Badge>
            </div>
          ))}
          {leaves.filter(l => l.status === 'pending').length === 0 && (
            <div className="text-xs text-slate-400 font-medium italic text-center py-6">No pending leave requests.</div>
          )}
        </CardContent>
      </Card>

      {/* Dynamic Org Calendar */}
      <Card className="p-0">
        <div className="px-4 md:px-6 pt-4 md:pt-5 pb-2 border-b border-slate-100">
          <h2 className="text-sm md:text-base font-bold text-slate-900">Organisation Calendar</h2>
          <p className="text-[10px] md:text-xs text-slate-500 mt-0.5">Leaves, task deadlines, and schedule conflicts — all teams in one view.</p>
        </div>
        <div className="p-3 md:p-6">
          <OrgCalendar leaves={leaves as any} tasks={tasks as any} employees={employees} />
        </div>
      </Card>

      {/* Announcements Panel */}
      <Card className="p-0">
        <div className="px-4 md:px-6 pt-4 md:pt-5 pb-2 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-sm md:text-base font-bold text-slate-900">Recent Announcements</h2>
            <p className="text-[10px] md:text-xs text-slate-500 mt-0.5">Corporate updates and targeted broadcast messages.</p>
          </div>
        </div>
        <CardContent className="p-0 divide-y divide-slate-100">
          {announcements.map(ann => (
            <div key={ann.id} className="p-4 md:px-6 flex flex-col justify-between">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                <div>
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
                  in hrData.ts. Clicking opens the full viewer list modal. */}
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
                          <Avatar key={v.id} src={v.profilePicture} name={displayName(v, 'hr')} size={22} className="ring-2 ring-white" />
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
            <p className="text-xs text-slate-400 font-semibold italic text-center py-6">No announcements posted yet.</p>
          )}
        </CardContent>
      </Card>

      <MaintenanceNoticeManager createdBy="HR Manager" />

      {/* --- MODALS --- */}

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
                  <Avatar src={v.profilePicture} name={displayName(v, 'hr')} size={36} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{displayName(v, 'hr')}</p>
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
              className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-orange-100 font-semibold"
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
              className="w-full bg-slate-50/50 hover:bg-slate-100 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-orange-100 font-semibold resize-none"
              placeholder="Type announcement details here..." 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Target Audience *</label>
            <select
              value={annTargetType}
              onChange={e => setAnnTargetType(e.target.value as any)}
              className="w-full bg-slate-50/50 hover:bg-slate-100 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-orange-100 font-semibold cursor-pointer"
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
            <button type="button" disabled={isPostingAnnouncement} onClick={() => setIsAnnounceOpen(false)} className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 font-bold px-4 py-2.5 md:py-2 rounded-xl text-xs active:scale-97 transition-colors transition-transform disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
            <button type="submit" disabled={isPostingAnnouncement} className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2.5 md:py-2 rounded-xl text-xs active:scale-97 transition-colors transition-transform shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5">
              {isPostingAnnouncement && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isPostingAnnouncement ? 'Posting…' : 'Post Announcement'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Task Assignment Modal */}
      <TaskModal
        isOpen={isTaskOpen}
        onClose={() => setIsTaskOpen(false)}
        employees={employees.filter((e: Profile) => e.role === 'employee' || e.isTeamLead)}
        createdBy="hr"
        onTaskAdded={(task) => refetchTasks()}
      />

      {/* Schedule Google Meet Modal */}
      <ScheduleMeetModal
        isOpen={isScheduleMeetOpen}
        onClose={() => setIsScheduleMeetOpen(false)}
      />

    </div>
  );
}
