'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bell, Search, X, User, CheckCircle2, Settings, LogOut, UserCircle, KeyRound, ClipboardList, HelpCircle, Users, BadgeHelp, Trash2, MapPin, Wallet, Clock, Briefcase, Megaphone } from 'lucide-react';
import {
  Notification, Profile, Task, Ticket, Team, Warehouse, PayrollRecord, LeaveApplication, CareerPosition, Announcement,
  hrActions, useProfiles, useTasks, useTickets, useNotifications, useTeams, useWarehouses, usePayroll, useLeaves, useCareers, useAnnouncements,
  displayName as resolveDisplayName, isTechnicalSupportMember,
} from '@/lib/hrData';
import { Avatar } from '@/components/ui/Avatar';
import { useRouter, usePathname } from 'next/navigation';
import { getSessionEmail, getSessionRole, clearSession } from '@/lib/session';
import { logoutPush } from '@/lib/push';
import { formatRelativeDateNY } from '@/lib/timezone';

// The bell only ever showed a bare time-of-day string (e.g. "3:02 AM") with
// no date — that's all `notification.timestamp` ever contained (see
// addNotification in hrData.ts, which formats it with
// toLocaleTimeString only, no date component, so there was never a date to
// recover from that field for any notification, old or new). PocketBase's
// own `created` system field always has the full date+time regardless of
// what's in `timestamp`, so this derives "Today"/"Yesterday"/a short date
// from that instead, to sit alongside the existing time string rather than
// replace it. "Today"/"Yesterday" are judged against America/New_York, not
// the device's local timezone — see src/lib/timezone.ts.
function formatNotificationWhen(created?: string): string {
  if (!created) return '';
  const date = new Date(created);
  if (isNaN(date.getTime())) return '';
  return formatRelativeDateNY(date);
}

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const isChatScreen = pathname?.endsWith('/chat') || pathname?.endsWith('/team-chats');
  const [search, setSearch] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  // Per-user read/cleared maps live in the hr_delcargo_store KV overlay
  // (see hrActions.getNotificationReadMap / getNotificationClearedMap) —
  // fetched into local state so isNotificationRead/isNotificationCleared can
  // be computed synchronously during render.
  const [readMap, setReadMap] = useState<Record<string, string[]>>({});
  const [clearedMap, setClearedMap] = useState<Record<string, string[]>>({});
  // Bumped after marking notifications read to force a re-render of
  // read/unread state computed via hrActions.isNotificationRead (which reads
  // the per-user read map, not component state).
  const [readVersion, setReadVersion] = useState(0);
  const [isBellOpen, setIsBellOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  const [role, setRole] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [profilePicture, setProfilePicture] = useState<string | null>(null);

  const bellRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);

  // Search Results States (filtered by RBAC — see performSearch below for
  // exactly which roles can see which entity types; this mirrors what each
  // role's Sidebar actually gives them a page for, so search never surfaces
  // a result someone couldn't otherwise navigate to).
  const [matchedEmployees, setMatchedEmployees] = useState<Profile[]>([]);
  const [matchedTasks, setMatchedTasks] = useState<Task[]>([]);
  const [matchedTickets, setMatchedTickets] = useState<Ticket[]>([]);
  const [matchedTeams, setMatchedTeams] = useState<Team[]>([]);
  const [matchedWarehouses, setMatchedWarehouses] = useState<Warehouse[]>([]);
  const [matchedPayroll, setMatchedPayroll] = useState<PayrollRecord[]>([]);
  const [matchedLeaves, setMatchedLeaves] = useState<LeaveApplication[]>([]);
  const [matchedCareers, setMatchedCareers] = useState<CareerPosition[]>([]);
  const [matchedAnnouncements, setMatchedAnnouncements] = useState<Announcement[]>([]);
  const [showResults, setShowResults] = useState(false);

  const { data: allProfiles } = useProfiles();
  const { data: allTasks } = useTasks();
  const { data: allTickets } = useTickets();
  const { data: allNotifications, refetch: refetchNotifications } = useNotifications();
  const { data: allTeams } = useTeams();
  const { data: allWarehouses } = useWarehouses();
  const { data: allPayroll } = usePayroll();
  const { data: allLeaves } = useLeaves();
  const { data: allCareers } = useCareers();
  const { data: allAnnouncements } = useAnnouncements();
  // Needed to scope an employee's own payroll record (PayrollRecord.employeeId
  // matches Profile.id, not email — see src/app/(dashboard)/employee/salary/page.tsx).
  const [profileId, setProfileId] = useState<string | null>(null);

  // Load the per-user read/cleared maps once on mount (KV overlay, not
  // localStorage — see hrData.ts).
  useEffect(() => {
    (async () => {
      const [rm, cm] = await Promise.all([
        hrActions.getNotificationReadMap(),
        hrActions.getNotificationClearedMap(),
      ]);
      setReadMap(rm);
      setClearedMap(cm);
    })();
  }, []);

  useEffect(() => {
    const savedRole = getSessionRole();
    const savedEmail = getSessionEmail();
    setRole(savedRole);
    setEmail(savedEmail);

    if (savedEmail && allProfiles) {
      const profile = allProfiles.find(e => e.email && savedEmail && e.email.toLowerCase() === savedEmail.toLowerCase());
      if (profile) {
        setDisplayName(profile.fullName);
        setProfilePicture(profile.profilePicture || null);
        setProfileId(profile.id);
      } else {
        setDisplayName(savedEmail?.split('@')[0] || '');
      }
    }

    if (savedRole && savedEmail && allNotifications) {
      const filtered = allNotifications.filter(n =>
        (n.recipientEmail === savedEmail ||
          (n.recipientRole === savedRole && n.recipientEmail === 'all')) &&
        !hrActions.isNotificationCleared(n, savedEmail, clearedMap)
      );
      setNotifications(filtered);
    }
  }, [allProfiles, allNotifications, clearedMap]);

  // Close elements when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setIsBellOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setIsProfileOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Dynamic Search Engine with RBAC — every entity below is scoped to
  // exactly what that role has a Sidebar page for (see Sidebar.tsx's
  // adminItems/hrItems/employeeItems), so results never link somewhere the
  // signed-in role couldn't otherwise reach.
  const isPrivileged = role === 'hr' || role === 'admin';

  const performSearch = (query: string) => {
    if (!query.trim() || !role) {
      setMatchedEmployees([]);
      setMatchedTasks([]);
      setMatchedTickets([]);
      setMatchedTeams([]);
      setMatchedWarehouses([]);
      setMatchedPayroll([]);
      setMatchedLeaves([]);
      setMatchedCareers([]);
      setMatchedAnnouncements([]);
      setShowResults(false);
      return;
    }

    const q = query.toLowerCase();
    setShowResults(true);

    // Employees — HR/Admin only (staff directory access).
    setMatchedEmployees(isPrivileged ? (allProfiles || []).filter(e =>
      e.fullName.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      (e.jobTitle || '').toLowerCase().includes(q)
    ) : []);

    // Tasks — full board for HR/Admin, only tasks assigned to me otherwise.
    const tasksScope = isPrivileged ? (allTasks || []) : (allTasks || []).filter(t => t.assignedEmail === email);
    setMatchedTasks(tasksScope.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
    ));

    // Tickets — HR sees HR tickets, Tech sees Tech tickets + their own, Admin sees all, others see their own.
    const currentProfile = (allProfiles || []).find(e => e.email?.toLowerCase() === (email || '').toLowerCase());
    const isTech = isTechnicalSupportMember(currentProfile?.teams);
    let ticketsScope = allTickets || [];
    if (role === 'hr') {
      ticketsScope = ticketsScope.filter(t => t.department === 'hr');
    } else if (role !== 'admin') {
      if (isTech) {
        ticketsScope = ticketsScope.filter(t => t.department === 'technical' || t.employeeEmail.toLowerCase() === (email || '').toLowerCase());
      } else {
        ticketsScope = ticketsScope.filter(t => t.employeeEmail.toLowerCase() === (email || '').toLowerCase());
      }
    }
    setMatchedTickets(ticketsScope.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
    ));

    // Teams — HR only (Team Management page lives under /hr, not /admin —
    // see Sidebar.tsx hrItems vs adminItems).
    setMatchedTeams(role === 'hr' ? (allTeams || []).filter(t => t.name.toLowerCase().includes(q)) : []);

    // Warehouses — Admin only (Warehouses page lives under /admin, not /hr).
    setMatchedWarehouses(role === 'admin' ? (allWarehouses || []).filter(w => w.name.toLowerCase().includes(q)) : []);

    // Payroll — full ledger for HR/Admin, only my own record otherwise
    // (PayrollRecord.employeeId matches Profile.id, not email).
    let payrollScope: PayrollRecord[] = [];
    if (isPrivileged) payrollScope = allPayroll || [];
    else if (profileId) payrollScope = (allPayroll || []).filter(p => p.employeeId === profileId);
    setMatchedPayroll(payrollScope.filter(p =>
      p.name.toLowerCase().includes(q) || (p.role || '').toLowerCase().includes(q)
    ));

    // Leaves — full queue for HR/Admin, only my own applications otherwise
    // (LeaveApplication has no employeeEmail field — the app matches leaves
    // to a person by employeeName === Profile.fullName everywhere else too).
    let leavesScope: LeaveApplication[] = [];
    if (isPrivileged) leavesScope = allLeaves || [];
    else if (displayName) leavesScope = (allLeaves || []).filter(l => l.employeeName === displayName);
    setMatchedLeaves(leavesScope.filter(l =>
      l.type.toLowerCase().includes(q) || l.reason.toLowerCase().includes(q) || l.status.toLowerCase().includes(q)
    ));

    // Career postings — the Career Board page exists for every role, so
    // open positions are searchable by everyone.
    setMatchedCareers((allCareers || []).filter(c =>
      c.title.toLowerCase().includes(q) || c.department.toLowerCase().includes(q)
    ));

    // Announcements — shown on every role's dashboard Overview, so
    // searchable by everyone too.
    setMatchedAnnouncements((allAnnouncements || []).filter(a =>
      a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q)
    ));
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    performSearch(val);
    window.dispatchEvent(new CustomEvent('globalSearch', { detail: val }));
  };

  const handleToggleBell = async () => {
    setIsBellOpen(prev => !prev);
    setIsProfileOpen(false);
    if (!isBellOpen && email && role) {
      await hrActions.markNotificationsAsRead(notifications, email, role);
      // Refresh the read map + the notifications list itself (personal
      // notifications get `read: true` written directly on the record) so
      // the bell re-renders without waiting on the next poll.
      const rm = await hrActions.getNotificationReadMap();
      setReadMap(rm);
      refetchNotifications();
      setReadVersion(v => v + 1);
    }
  };

  const handleClearAll = async () => {
    if (!email || !role || notifications.length === 0 || isClearing) return;
    setIsClearing(true);
    try {
      await hrActions.clearAllNotificationsFor(notifications, email, role);
      // Dismissal is per-user (see clearAllNotificationsFor in hrData.ts) —
      // this only empties this user's own bell, not the underlying
      // notifications other recipients of a broadcast still have.
      const [rm, cm] = await Promise.all([
        hrActions.getNotificationReadMap(),
        hrActions.getNotificationClearedMap(),
      ]);
      setReadMap(rm);
      setClearedMap(cm);
      setNotifications([]);
      setReadVersion(v => v + 1);
    } finally {
      setIsClearing(false);
    }
  };

  const handleSignOut = async () => {
    // This app authenticates against hr_profiles directly (see auth/page.tsx)
    // rather than PocketBase's built-in auth collection, so there is no
    // pb.authStore session to clear here — just drop the local session markers.
    await hrActions.performLogout(email || '', role);
    // Unlink this device's push subscription from the outgoing user before
    // dropping the session — matters most on shared/kiosk devices, so the
    // next person who signs in doesn't inherit the previous employee's push
    // targeting.
    await logoutPush();
    clearSession();
    router.push('/auth');
  };

  const handleGoToProfile = () => {
    setIsProfileOpen(false);
    const dashPrefix = role === 'admin' ? '/admin' : role === 'hr' ? '/hr' : '/employee';
    router.push(`${dashPrefix}/profile`);
  };

  const navigateToResult = (url: string) => {
    setSearch('');
    setShowResults(false);
    setIsMobileSearchOpen(false);
    router.push(url);
  };

  const unreadCount = email
    ? notifications.filter(n => !hrActions.isNotificationRead(n, email, readMap)).length
    : 0;
  // Referenced only to satisfy the dependency-tracking eslint rule; the
  // actual re-computation is triggered by readVersion bumping this render.
  void readVersion;
  const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U';
  const hasAnyResults = matchedEmployees.length > 0 || matchedTasks.length > 0 || matchedTickets.length > 0 || matchedTeams.length > 0
    || matchedWarehouses.length > 0 || matchedPayroll.length > 0 || matchedLeaves.length > 0 || matchedCareers.length > 0 || matchedAnnouncements.length > 0;

  const payrollHref = role === 'admin' ? '/admin/payroll' : role === 'hr' ? '/hr/payroll' : '/employee/salary';
  const leavesHref = role === 'admin' ? '/admin/leaves' : role === 'hr' ? '/hr/leaves' : '/employee/leaves';
  const careersHref = role === 'admin' ? '/admin/careers' : role === 'hr' ? '/hr/careers' : '/employee/careers';
  const dashboardHomeHref = role === 'admin' ? '/admin' : role === 'hr' ? '/hr' : '/employee';

  // Shared list of result category blocks — rendered identically inside the
  // desktop dropdown and the mobile full-screen overlay so every searchable
  // entity type is available consistently on both, capped to 4 rows on
  // desktop (compact dropdown) and uncapped on mobile (full-screen list).
  const renderResultGroups = (limit?: number) => (
    <>
      {matchedEmployees.length > 0 && (
        <div className="p-3">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <User className="h-3 w-3" /> Employees ({matchedEmployees.length})
          </div>
          <div className="space-y-1">
            {(limit ? matchedEmployees.slice(0, limit) : matchedEmployees).map(emp => (
              <button key={emp.email} onClick={() => navigateToResult(role === 'hr' ? `/hr/teams` : `/admin/payroll`)}
                className="w-full text-left p-2.5 hover:bg-slate-50 rounded-xl text-xs flex justify-between items-center transition-colors min-h-[44px]">
                <div>
                  <p className="font-bold text-slate-800">{resolveDisplayName(emp, role as 'hr' | 'admin')}</p>
                  <p className="text-[10px] text-slate-400">{emp.email}</p>
                </div>
                <span className="text-[9px] uppercase tracking-wider font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">{emp.role}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {matchedTasks.length > 0 && (
        <div className="p-3">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <ClipboardList className="h-3 w-3" /> Tasks ({matchedTasks.length})
          </div>
          <div className="space-y-1">
            {(limit ? matchedTasks.slice(0, limit) : matchedTasks).map(task => (
              <button key={task.id} onClick={() => navigateToResult(role === 'hr' ? `/hr/tasks` : role === 'admin' ? `/admin/tasks` : `/employee/tasks`)}
                className="w-full text-left p-2.5 hover:bg-slate-50 rounded-xl text-xs flex justify-between items-center transition-colors min-h-[44px]">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-800 truncate">{task.title}</p>
                  <p className="text-[10px] text-slate-400 truncate">{task.assignedTo}</p>
                </div>
                <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ml-2 ${task.status === 'done' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>{task.status}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {matchedTickets.length > 0 && (
        <div className="p-3">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <HelpCircle className="h-3 w-3" /> Tickets ({matchedTickets.length})
          </div>
          <div className="space-y-1">
            {(limit ? matchedTickets.slice(0, limit) : matchedTickets).map(ticket => (
              <button key={ticket.id} onClick={() => navigateToResult(role === 'hr' ? `/hr/tickets` : role === 'admin' ? `/admin/tickets` : `/employee/tickets`)}
                className="w-full text-left p-2.5 hover:bg-slate-50 rounded-xl text-xs flex justify-between items-center transition-colors min-h-[44px]">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-800 truncate">{ticket.title}</p>
                  <p className="text-[10px] text-slate-400 truncate">{ticket.employeeName}</p>
                </div>
                <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ml-2 ${ticket.status === 'open' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{ticket.status}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {matchedTeams.length > 0 && (
        <div className="p-3">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Users className="h-3 w-3" /> Teams ({matchedTeams.length})
          </div>
          <div className="space-y-1">
            {(limit ? matchedTeams.slice(0, limit) : matchedTeams).map(t => (
              <button key={t.id} onClick={() => navigateToResult('/hr/teams')}
                className="w-full text-left p-2.5 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 flex justify-between items-center transition-colors min-h-[44px]">
                <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-slate-400" /> {t.name}</span>
                <span className="text-[9px] uppercase font-bold text-orange-600">View</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {matchedWarehouses.length > 0 && (
        <div className="p-3">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Warehouses ({matchedWarehouses.length})
          </div>
          <div className="space-y-1">
            {(limit ? matchedWarehouses.slice(0, limit) : matchedWarehouses).map(w => (
              <button key={w.id} onClick={() => navigateToResult('/admin/warehouses')}
                className="w-full text-left p-2.5 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 flex justify-between items-center transition-colors min-h-[44px]">
                <span>{w.name}</span>
                <span className="text-[9px] uppercase font-bold text-orange-600">View</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {matchedPayroll.length > 0 && (
        <div className="p-3">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Wallet className="h-3 w-3" /> Payroll ({matchedPayroll.length})
          </div>
          <div className="space-y-1">
            {(limit ? matchedPayroll.slice(0, limit) : matchedPayroll).map(p => (
              <button key={p.id} onClick={() => navigateToResult(payrollHref)}
                className="w-full text-left p-2.5 hover:bg-slate-50 rounded-xl text-xs flex justify-between items-center transition-colors min-h-[44px]">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-800 truncate">{p.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{p.role}</p>
                </div>
                <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ml-2 ${p.processed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>{p.processed ? 'paid' : 'pending'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {matchedLeaves.length > 0 && (
        <div className="p-3">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Clock className="h-3 w-3" /> Leaves ({matchedLeaves.length})
          </div>
          <div className="space-y-1">
            {(limit ? matchedLeaves.slice(0, limit) : matchedLeaves).map(l => (
              <button key={l.id} onClick={() => navigateToResult(leavesHref)}
                className="w-full text-left p-2.5 hover:bg-slate-50 rounded-xl text-xs flex justify-between items-center transition-colors min-h-[44px]">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-800 truncate">{l.employeeName}</p>
                  <p className="text-[10px] text-slate-400 truncate">{l.type} · {l.duration}</p>
                </div>
                <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ml-2 ${l.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : l.status === 'rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{l.status}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {matchedCareers.length > 0 && (
        <div className="p-3">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Briefcase className="h-3 w-3" /> Career Board ({matchedCareers.length})
          </div>
          <div className="space-y-1">
            {(limit ? matchedCareers.slice(0, limit) : matchedCareers).map(c => (
              <button key={c.id} onClick={() => navigateToResult(careersHref)}
                className="w-full text-left p-2.5 hover:bg-slate-50 rounded-xl text-xs flex justify-between items-center transition-colors min-h-[44px]">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-800 truncate">{c.title}</p>
                  <p className="text-[10px] text-slate-400 truncate">{c.department}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      {matchedAnnouncements.length > 0 && (
        <div className="p-3">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Megaphone className="h-3 w-3" /> Announcements ({matchedAnnouncements.length})
          </div>
          <div className="space-y-1">
            {(limit ? matchedAnnouncements.slice(0, limit) : matchedAnnouncements).map(a => (
              <button key={a.id} onClick={() => navigateToResult(dashboardHomeHref)}
                className="w-full text-left p-2.5 hover:bg-slate-50 rounded-xl text-xs flex flex-col gap-0.5 transition-colors min-h-[44px]">
                <p className="font-bold text-slate-800 truncate">{a.title}</p>
                <p className="text-[10px] text-slate-400 truncate">{a.content}</p>
              </button>
            ))}
          </div>
        </div>
      )}
      {!hasAnyResults && (
        <div className="p-8 text-center text-slate-400 font-semibold italic text-xs">No matching results found.</div>
      )}
    </>
  );

  // Shared search results dropdown content (desktop)
  const SearchResults = () => (
    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-[60vh] overflow-y-auto divide-y divide-slate-100 popover-enter">
      {renderResultGroups(4)}
    </div>
  );

  return (
    <>
      {/* Main TopNav bar. min-h-* + pt-safe, not h-14/h-16 — on notched/
          Dynamic-Island iPhones the WebView draws under the status bar
          (viewportFit: 'cover' in layout.tsx), so a fixed-height header with
          no top padding rendered its content (search, bell, avatar) under
          the status bar. pt-safe (globals.css) adds
          env(safe-area-inset-top) of padding above the content instead —
          a no-op on web/desktop, where that env() value is 0. */}
      {/* border-b swapped for an after: gradient fade — this bar is
          translucent (bg-white/85 backdrop-blur-md), and a hard 1px line
          under a blurred material reads as a flat panel with a ruled edge
          rather than a floating glass layer. A soft fade where scrolled
          content meets the bar underneath is the more native-feeling
          "scroll edge effect" instead. */}
      <header className="relative min-h-14 md:min-h-16 bg-white/85 backdrop-blur-md flex items-center justify-between px-4 md:px-6 sticky top-0 z-20 gap-3 pt-safe after:content-[''] after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-3 after:bg-gradient-to-b after:from-slate-950/[0.06] after:to-transparent">

        {/* Desktop Search Bar — hidden on mobile */}
        <div className="hidden md:flex flex-1 items-center max-w-md relative">
          <Search className="absolute left-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            onFocus={() => search.trim() && setShowResults(true)}
            placeholder="Search employees, tasks, payroll, leaves..."
            className="w-full bg-slate-100/80 border border-transparent rounded-full py-1.5 pl-10 pr-4 text-sm focus:border-orange-500 focus:bg-white outline-none text-slate-900 transition-colors font-semibold"
          />
          {showResults && search.trim().length > 0 && <SearchResults />}
        </div>

        {/* Mobile: Brand name or back button */}
        <div className="md:hidden font-bold text-base text-orange-600 tracking-tight flex items-center gap-2">
          {(!['/admin', '/hr', '/employee'].includes(pathname)) ? (
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1 text-slate-700 hover:text-orange-600 transition-colors py-1 pr-2 active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              <span className="text-xs font-bold">Back</span>
            </button>
          ) : (
            "DelCargo HR"
          )}
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-1.5 md:gap-3">

          {/* Mobile search icon */}
          {!isChatScreen && (
            <button
              onClick={() => setIsMobileSearchOpen(true)}
              className="md:hidden p-2 rounded-full text-slate-500 hover:bg-slate-100 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              <Search className="h-5 w-5" />
            </button>
          )}

          {/* Bell */}
          <div ref={bellRef} className="relative">
            <button
              onClick={handleToggleBell}
              className="p-2 rounded-full text-slate-500 hover:bg-slate-100 transition-colors relative min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-rose-500 text-white font-bold text-[9px] flex items-center justify-center border border-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {isBellOpen && (
              <div className="fixed top-16 left-4 right-4 sm:absolute sm:top-12 sm:right-0 sm:left-auto sm:w-[320px] bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden popover-enter">
                <div className="p-3.5 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center gap-2">
                  <span className="font-bold text-xs text-slate-800">Notifications</span>
                  <div className="flex items-center gap-2">
                    {notifications.length > 0 && (
                      <button
                        onClick={handleClearAll}
                        disabled={isClearing}
                        className="text-[9px] font-bold text-slate-500 hover:text-rose-600 disabled:opacity-50 flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" /> {isClearing ? 'Clearing…' : 'Clear All'}
                      </button>
                    )}
                    <span className="text-[9px] text-slate-500 font-semibold capitalize">Scope: {role}</span>
                  </div>
                </div>
                <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100">
                  {notifications.map(n => {
                    const isUnread = !!email && !hrActions.isNotificationRead(n, email, readMap);
                    const content = (
                      <>
                        <div className="text-slate-700 leading-relaxed font-medium whitespace-pre-wrap break-words">{n.message}</div>
                        <div className="text-[9px] text-slate-400 font-medium text-right">
                          {formatNotificationWhen(n.created)}{formatNotificationWhen(n.created) && n.timestamp ? ' • ' : ''}{n.timestamp}
                        </div>
                      </>
                    );
                    // Only notifications with a `link` (ticket/leave/chat_mention —
                    // see buildNotificationLink in hrData.ts) are clickable.
                    // Older notifications created before this field existed, and
                    // generic/'internal' ones with nothing to deep-link to, render
                    // as a plain row same as before.
                    if (n.link) {
                      return (
                        <button
                          key={n.id}
                          onClick={() => {
                            setIsBellOpen(false);
                            router.push(n.link!);
                          }}
                          className={`w-full text-left p-3.5 text-xs flex flex-col gap-1 transition-colors hover:bg-slate-50 ${isUnread ? 'bg-orange-50/40' : ''}`}
                        >
                          {content}
                        </button>
                      );
                    }
                    return (
                      <div key={n.id} className={`p-3.5 text-xs flex flex-col gap-1 ${isUnread ? 'bg-orange-50/40' : ''}`}>
                        {content}
                      </div>
                    );
                  })}
                  {notifications.length === 0 && (
                    <div className="p-8 text-center text-slate-400 font-medium text-xs">No alerts active</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Profile avatar */}
          <div ref={profileRef} className="relative">
            <button
              onClick={() => { setIsProfileOpen(prev => !prev); setIsBellOpen(false); }}
              className="hover:opacity-80 transition-opacity rounded-full"
            >
              <Avatar src={profilePicture} name={displayName || 'User'} size={36} />
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 top-12 w-[min(220px,85vw)] bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden popover-enter">
                <div className="p-3.5 border-b border-slate-100 bg-slate-50/50">
                  <p className="font-bold text-slate-900 text-sm truncate">{displayName}</p>
                  <p className="text-[10px] text-slate-500 truncate">{email}</p>
                  <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider text-orange-700 bg-orange-50 border border-orange-100 px-1.5 py-0.5 rounded">{role}</span>
                </div>
                <div className="py-1.5">
                  <button onClick={handleGoToProfile}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors min-h-[44px]">
                    <UserCircle className="h-4 w-4 text-slate-400" /> View Profile
                  </button>
                  <button onClick={handleSignOut}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors border-t border-slate-100 min-h-[44px]">
                    <LogOut className="h-4 w-4 text-rose-500" /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Slide-Up Search Sheet */}
      {isMobileSearchOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm fade-enter" 
            onClick={() => { setIsMobileSearchOpen(false); setSearch(''); setShowResults(false); }} 
          />
          <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col w-full h-[85vh] drawer-enter-bottom">
            {/* Drag Handle */}
            <div className="flex justify-center pt-3 pb-2 shrink-0">
              <div className="h-1.5 w-12 bg-slate-200 rounded-full" />
            </div>

            <div className="flex items-center gap-3 px-4 pb-3 border-b border-slate-100 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={handleSearchChange}
                  autoFocus
                  placeholder="Search anything..."
                  className="w-full bg-slate-100/70 border border-transparent rounded-xl py-3 pl-10 pr-4 text-[16px] focus:border-slate-300 outline-none text-slate-900 focus:bg-slate-50 transition-colors font-medium"
                />
              </div>
              <button
                onClick={() => { setIsMobileSearchOpen(false); setSearch(''); setShowResults(false); }}
                className="text-[15px] font-semibold text-slate-500 hover:text-slate-800 transition-colors px-1"
              >
                Cancel
              </button>
            </div>

            {/* Search results */}
            <div className="flex-1 overflow-y-auto pb-safe">
              {search.trim().length > 0 && showResults && (
                <div className="divide-y divide-slate-100">
                  {renderResultGroups()}
                </div>
              )}
              {!search.trim() && (
                <div className="p-8 text-center text-slate-400 font-medium text-sm">Start typing to search across all records</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
