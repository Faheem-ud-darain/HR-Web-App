'use client';
import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Users, UserPlus, Clock, LogOut, Wallet, ClipboardList, Star, BookOpen, Briefcase, HelpCircle, Menu, X, FileText, MapPin, Monitor, MessageSquare, MessageCircle, ChevronLeft, ChevronRight, UserX, UserCheck, Smartphone, Download } from 'lucide-react';
import { hrActions, useProfiles, useTeams, useTickets, useAllMessages, useKVByPrefix, hasUnseenTicketActivity, hasUnseenMessageActivity, TrackingSettings } from '@/lib/hrData';
import { getSessionEmail, clearSession } from '@/lib/session';
import { logoutPush } from '@/lib/push';
import { useAnyModalOpen } from '@/lib/modalStack';
import { triggerHaptic } from '@/lib/haptics';

interface SidebarProps {
  role: 'admin' | 'hr' | 'employee' | 'team_lead';
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isTeamLead, setIsTeamLead] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNavVisible, setIsNavVisible] = useState(true);
  const lastScrollY = useRef(0);

  // Auto-hide mobile bottom nav bar on scroll down, show on scroll up
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleScrollEvent = (e: Event) => {
      const target = e.target as HTMLElement | Document;
      let currentScrollY = 0;

      if (target === document || target === document.documentElement || (target as any) === window) {
        currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      } else if (target instanceof HTMLElement) {
        // Only track vertical overflow scrollable elements
        if (target.scrollTop !== undefined && (target.tagName === 'MAIN' || target.classList.contains('overflow-y-auto'))) {
          currentScrollY = target.scrollTop;
        } else {
          return;
        }
      }

      if (currentScrollY <= 10) {
        setIsNavVisible(true);
        lastScrollY.current = currentScrollY;
        return;
      }

      const diff = currentScrollY - lastScrollY.current;

      if (diff > 5) {
        setIsNavVisible(false);
      } else if (diff < -5) {
        setIsNavVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    // Capture phase listener catches scroll events on any child element (e.g. main.overflow-y-auto)
    window.addEventListener('scroll', handleScrollEvent, true);
    return () => {
      window.removeEventListener('scroll', handleScrollEvent, true);
    };
  }, [pathname]);
  // Desktop-only "hide sidebar" toggle — collapses to an icon rail instead
  // of the full 256px-wide panel. Persisted so it stays collapsed across
  // page loads/navigation instead of resetting every time. Purely a
  // layout/CSS change — it doesn't reduce any network fetches — but it
  // does cut down on rendered DOM (labels, dots) and gives more screen
  // space, which some people do notice as feeling snappier.
  const [isCollapsed, setIsCollapsed] = useState(false);
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('sidebar_collapsed') : null;
    if (saved === '1') setIsCollapsed(true);
  }, []);
  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') window.localStorage.setItem('sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  };
  const [platform, setPlatform] = useState<'ios' | 'android'>('ios');
  const [userEmail, setUserEmail] = useState('');
  const [myTeamIds, setMyTeamIds] = useState<string[] | 'all'>([]);
  const drawerRef = useRef<HTMLDivElement>(null);
  const { data: profiles } = useProfiles();
  const { data: allTeams } = useTeams();
  // Self-healing fallback: hr_profiles.tracking_enabled (which used to be
  // the only thing gating this nav link) can be out of sync with the real
  // "is screen tracking actually on" flag, which lives in this KV row
  // instead. Checking both means employees whose tracking was turned on
  // via the Tracking Monitor page before the two flags were kept in sync
  // still see the link, without HR/Admin needing to re-toggle anything.
  const { data: trackingSettingsRows } = useKVByPrefix('hr_tracking_settings_prod_v1');
  // Polls every 15s via useTickets' own refetchInterval, so the dot can
  // light up without the user needing to be on the tickets page.
  const { data: allTickets } = useTickets();
  // Same idea for Team Chat — see useAllMessages' comment in hrData.ts.
  const { data: allMessages } = useAllMessages();

  const hasUnseenTickets = hasUnseenTicketActivity(allTickets || [], role, userEmail);
  const hasUnseenChat = hasUnseenMessageActivity(allMessages || [], myTeamIds, role, userEmail);

  useEffect(() => {
    const email = getSessionEmail();
    if (email) setUserEmail(email);
    if (email && profiles) {
      const profile = profiles.find(e => e.email && email && e.email.toLowerCase() === email.toLowerCase());
      setIsTeamLead(!!(profile?.isTeamLead && (profile.leadTeams?.length ?? 0) > 0));

      const settingsList = ((trackingSettingsRows || []).find(r => r.key === 'hr_tracking_settings_prod_v1')?.value as TrackingSettings[]) || [];
      const mySettings = settingsList.find(s => s.employeeEmail?.toLowerCase() === email.toLowerCase());
      setTrackingEnabled(!!profile?.trackingEnabled || !!mySettings?.enabled);

      // Admin is auto-a-member of every team channel (see TeamChatView),
      // so their "unseen" signature spans every team, not just ones
      // they're formally on. Everyone else: the specific teams they're a
      // member of or lead, resolved to ids via hr_teams.
      if (role === 'admin' || role === 'hr') {
        // HR now has the same "every team" Team Chats/Documents oversight
        // as Admin (see hr/team-chats/page.tsx) — without this they'd never
        // show as unread since hr_profiles.teams is normally empty for HR.
        setMyTeamIds('all');
      } else if (profile && allTeams) {
        const names = new Set([...(profile.teams || []), ...(profile.leadTeams || [])]);
        setMyTeamIds(allTeams.filter(t => names.has(t.name)).map(t => t.id));
      }
    }

    // Dynamic OS Platform Detection for iOS vs Android
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setPlatform('ios');
      document.body.classList.add('platform-ios');
      document.body.classList.remove('platform-android');
    } else if (/android/.test(ua)) {
      setPlatform('android');
      document.body.classList.add('platform-android');
      document.body.classList.remove('platform-ios');
    } else {
      // Desktop Developer Emulation check (Chrome devtools overrides userAgent on devices)
      if (ua.includes('android')) {
        setPlatform('android');
      } else {
        setPlatform('ios'); // default fallback
      }
    }
  }, [profiles, allTeams, role, trackingSettingsRows]);

  // Click outside listener for mobile drawer
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isMobileMenuOpen]);

  const handleSignOut = async () => {
    await hrActions.performLogout(userEmail, role);
    await logoutPush();
    clearSession();
    router.push('/auth');
  };

  const adminItems = [
    { name: 'Overview', href: '/admin', icon: LayoutDashboard },
    { name: 'Warehouses', href: '/admin/warehouses', icon: MapPin },
    { name: 'Tasks', href: '/admin/tasks', icon: ClipboardList },
    { name: 'Leaves Approval', href: '/admin/leaves', icon: Clock },
    { name: 'Payroll & Salary', href: '/admin/payroll', icon: Wallet },
    { name: 'Attendance', href: '/admin/absences', icon: UserCheck },
    { name: 'Career Board', href: '/admin/careers', icon: Briefcase },
    { name: 'Master Reports', href: '/admin/reports', icon: FileText },
    { name: 'Screen Tracking', href: '/admin/tracking', icon: Monitor },
    { name: 'Support Tickets', href: '/admin/tickets', icon: HelpCircle },
    { name: 'Team Chats', href: '/admin/team-chats', icon: MessageSquare },
    { name: 'Direct Messages', href: '/admin/direct-messages', icon: MessageCircle },

  ];

  const hrItems = [
    { name: 'HR Dashboard', href: '/hr', icon: LayoutDashboard },
    { name: 'Task Management', href: '/hr/tasks', icon: ClipboardList },
    { name: 'Onboarding', href: '/hr/onboarding', icon: UserPlus },
    { name: 'Leave Management', href: '/hr/leaves', icon: Clock },
    { name: 'Team Management', href: '/hr/teams', icon: Users },
    { name: 'Payroll Records', href: '/hr/payroll', icon: Wallet },
    { name: 'Attendance', href: '/hr/absences', icon: UserCheck },
    { name: 'Career Board', href: '/hr/careers', icon: Briefcase },
    { name: 'Master Reports', href: '/hr/reports', icon: FileText },
    { name: 'Screen Tracking', href: '/hr/tracking', icon: Monitor },
    { name: 'Support Tickets', href: '/hr/tickets', icon: HelpCircle },
    { name: 'Team Chats', href: '/hr/team-chats', icon: MessageSquare },
    { name: 'Direct Messages', href: '/hr/direct-messages', icon: MessageCircle },

  ];

  const employeeItems = [
    { name: 'My Dashboard', href: '/employee', icon: LayoutDashboard },
    ...(trackingEnabled ? [{ name: 'Timesheet Tracker', href: '/employee/tracker', icon: Clock }] : []),
    { name: 'My Leaves', href: '/employee/leaves', icon: Clock },
    { name: 'Attendance', href: '/employee/absences', icon: UserCheck },
    { name: 'Salary History', href: '/employee/salary', icon: Wallet },
    { name: 'Career Board', href: '/employee/careers', icon: Briefcase },
    { name: 'Support Tickets', href: '/employee/tickets', icon: HelpCircle },
    { name: 'Team Chat', href: '/employee/chat', icon: MessageSquare },
    { name: 'HR Messages', href: '/employee/direct-messages', icon: MessageCircle },
    ...(isTeamLead ? [{ name: 'Team Tasks ⭐', href: '/employee/tasks', icon: Star }] : []),
    // Read-only screenshots/mouse-activity viewer for their own teammates —
    // Team Leads can never change tracking settings, only view. See
    // TrackingView.tsx's canManage gating.
    ...(isTeamLead ? [{ name: 'Team Tracking', href: '/employee/team-tracking', icon: Monitor }] : []),
  ];

  const navMap: Record<string, typeof adminItems> = {
    admin: adminItems,
    hr: hrItems,
    employee: employeeItems,
    team_lead: employeeItems,
  };

  const links = navMap[role] ?? employeeItems;

  // Dedicated role-scoped policy href
  const policyHref = role === 'admin' ? '/admin/policy' : role === 'hr' ? '/hr/policy' : '/employee/policy';
  const isPolicyActive = pathname === policyHref;

  // Mobile bar tabs mapping
  const getMobileQuickLinks = () => {
    if (role === 'hr') {
      return [
        { name: 'Home', href: '/hr', icon: LayoutDashboard },
        { name: 'Tasks', href: '/hr/tasks', icon: ClipboardList },
        { name: 'Chats', href: '/hr/team-chats', icon: MessageSquare },
        { name: 'Tickets', href: '/hr/tickets', icon: HelpCircle },
      ];
    }
    if (role === 'admin') {
      return [
        { name: 'Overview', href: '/admin', icon: LayoutDashboard },
        { name: 'Tasks', href: '/admin/tasks', icon: ClipboardList },
        { name: 'Chats', href: '/admin/team-chats', icon: MessageSquare },
        { name: 'Tickets', href: '/admin/tickets', icon: HelpCircle },
      ];
    }
    return [
      { name: 'Dashboard', href: '/employee', icon: LayoutDashboard },
      { name: 'Chats', href: '/employee/chat', icon: MessageSquare },
      { name: 'Tickets', href: '/employee/tickets', icon: HelpCircle },
      ...(isTeamLead ? [{ name: 'Team Tasks', href: '/employee/tasks', icon: Star }] : [{ name: 'Salary', href: '/employee/salary', icon: Wallet }]),
    ];
  };

  const mobileQuickLinks = getMobileQuickLinks();
  const mobileSideLinks = links.filter(link => !mobileQuickLinks.some(quick => quick.href === link.href));
  const isChatScreen = pathname.endsWith('/chat') || pathname.endsWith('/team-chats');
  // Support Tickets is a list + detail view on the SAME route (no separate
  // URL for an open ticket) — the list should behave like every other
  // screen and show the nav; only an actually-open ticket (a full-screen
  // overlay on mobile) should hide it, which TicketsView now handles
  // itself via pushModal/popModal, same as any other modal.
  const hideBottomNav = isChatScreen;
  // Belt-and-suspenders alongside the page-enter containing-block fix: hides
  // the floating pill nav whenever any modal (shared Modal.tsx, or a
  // hand-rolled one like UserProfileModal/the screenshot lightbox) is open,
  // so it can never visually float on top of one again — see modalStack.ts.
  const anyModalOpen = useAnyModalOpen();

  return (
    <>
      {/* Desktop Sidebar (hidden on mobile) — white per DESIGN.md, with the
          structural improvements kept: refined active state (filled pill +
          dot, not just a color swap), consistent icon sizing, one-time
          mount stagger. */}
      {/* transition-[width], not transition-all — the only property that
          actually changes on this element when isCollapsed toggles is
          width (the inner header div's padding swap below is instant,
          not animated), so transition-all was animating a property no
          one asked it to watch. */}
      <aside className={`hidden md:flex ${isCollapsed ? 'w-[68px]' : 'w-64'} border-r border-slate-200 bg-white flex-col h-screen sticky top-0 transition-[width] duration-200 ease-out motion-reduce:transition-none`}>
        <div className={`h-16 flex items-center shrink-0 border-b border-slate-200 ${isCollapsed ? 'justify-center px-2' : 'gap-2.5 px-6'}`}>
          <div className="h-8 w-8 rounded-lg bg-orange-600 flex items-center justify-center shrink-0">
            <span className="text-white font-black text-sm">D</span>
          </div>
          {!isCollapsed && (
            <div className="font-display font-bold text-[15px] text-slate-900 tracking-tight leading-none">
              DelCargo <span className="text-slate-400 font-semibold">HR</span>
            </div>
          )}
        </div>

        <nav className={`flex-1 overflow-y-auto py-3 space-y-0.5 ${isCollapsed ? 'px-2' : 'px-3'}`}>
          {links.map((item, i) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            const showDot = (item.href.endsWith('/tickets') && hasUnseenTickets) || ((item.href.endsWith('/chat') || item.href.endsWith('/team-chats')) && hasUnseenChat);
            return (
              <Link
                key={item.name}
                href={item.href}
                title={isCollapsed ? item.name : undefined}
                className={`stagger-item group flex items-center py-2.5 rounded-lg text-sm font-semibold transition-colors duration-200 relative ${
                  isCollapsed ? 'justify-center px-0' : 'px-3'
                } ${
                  isActive
                    ? 'bg-orange-50 text-orange-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
                style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
              >
                <span className={`relative shrink-0 ${isCollapsed ? '' : 'mr-3'}`}>
                  <Icon className={`h-[18px] w-[18px] transition-colors ${isActive ? 'text-orange-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                  {showDot && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white presence-dot" />}
                </span>
                {!isCollapsed && <span className="truncate">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Actions section */}
        <div className={`p-3 border-t border-slate-200 space-y-0.5 shrink-0 ${isCollapsed ? 'px-2' : ''}`}>
          <button
            onClick={toggleCollapsed}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`flex w-full items-center py-2.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors duration-200 ${
              isCollapsed ? 'justify-center px-0' : 'px-3'
            }`}
          >
            {isCollapsed ? <ChevronRight className="h-[18px] w-[18px] text-slate-400" /> : <ChevronLeft className={`h-[18px] w-[18px] text-slate-400 mr-3`} />}
            {!isCollapsed && 'Hide sidebar'}
          </button>
          <Link
            href={policyHref}
            title={isCollapsed ? 'Policy Handbook' : undefined}
            className={`flex w-full items-center py-2.5 rounded-lg text-sm font-semibold transition-colors duration-200 mb-1 ${
              isCollapsed ? 'justify-center px-0' : 'px-3'
            } ${isPolicyActive ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <BookOpen className={`h-[18px] w-[18px] ${isCollapsed ? '' : 'mr-3'} ${isPolicyActive ? 'text-orange-600' : 'text-slate-400'}`} />
            {!isCollapsed && 'Policy Handbook'}
          </Link>
          

          <button
            onClick={handleSignOut}
            title={isCollapsed ? 'Sign out' : undefined}
            className={`flex w-full items-center py-2.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition-colors duration-200 ${
              isCollapsed ? 'justify-center px-0' : 'px-3'
            }`}
          >
            <LogOut className={`h-[18px] w-[18px] text-slate-400 ${isCollapsed ? '' : 'mr-3'}`} />
            {!isCollapsed && 'Sign out'}
          </button>
        </div>
      </aside>

      {/* Floating Pill Bottom Tab Bar. Uses an arbitrary-value `bottom`
          (below) instead of bare bottom-6 — on iPhones with a home
          indicator (X/11/12+), a fixed 24px gap can sit right on top of
          the indicator's swipe zone instead of floating clearly above
          it. `bottom` isn't a padding property so this doesn't hit the
          same cascade-collision bug as pt-safe/pb-safe; it's just
          additive by construction. env() resolves to 0 on Android/web,
          so this is exactly the original 1.5rem there. */}
      {!hideBottomNav && !anyModalOpen && (
        <div
          className={`md:hidden fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 bg-white/90 backdrop-blur-xl border border-slate-200/50 rounded-full shadow-lg flex justify-around items-center px-2 py-2 transition-all duration-300 ease-in-out ${
            isNavVisible ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-28 opacity-0 pointer-events-none'
          }`}
        >
          {mobileQuickLinks.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            const showDot = (item.href.endsWith('/tickets') && hasUnseenTickets) || ((item.href.endsWith('/chat') || item.href.endsWith('/team-chats')) && hasUnseenChat);
            
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => triggerHaptic.light()}
                className="flex items-center justify-center relative active:scale-95 transition-transform"
              >
                {isActive ? (
                  <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-orange-500 to-orange-600 flex items-center justify-center shadow-md">
                    <Icon className="h-6 w-6 text-white" strokeWidth={2} />
                    {showDot && <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-rose-500 border-2 border-white presence-dot" />}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-12 w-12">
                    <Icon className="h-6 w-6 text-slate-400" strokeWidth={1.5} />
                    {showDot && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-rose-500 border border-white presence-dot" />}
                  </div>
                )}
              </Link>
            );
          })}
          
          <button
            onClick={() => { triggerHaptic.light(); setIsMobileMenuOpen(true); }}
            className="flex items-center justify-center relative active:scale-95 transition-transform"
          >
            {isMobileMenuOpen ? (
              <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-orange-500 to-orange-600 flex items-center justify-center shadow-md">
                <Menu className="h-6 w-6 text-white" strokeWidth={2} />
              </div>
            ) : (
              <div className="flex items-center justify-center h-12 w-12">
                <Menu className="h-6 w-6 text-slate-400" strokeWidth={1.5} />
              </div>
            )}
          </button>
        </div>
      )}

      {/* Mobile Drawer (Left Slide-Out) Styled by Platform */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div 
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm fade-enter"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* px-5 + arbitrary pt/pb (not plain p-5) — this is a fixed
              inset-0, h-full overlay (same class of bug as TopNav/
              TicketsView/TeamChatView): on notched/Dynamic-Island iPhones
              its own "DelCargo Menu" header and the Sign Out button at the
              bottom would otherwise render under the status bar / home
              indicator. Using calc(1.25rem + env(safe-area-inset-*)) as
              one arbitrary utility (rather than a separate pt-safe class
              alongside p-5) avoids relying on which of two same-property
              utilities wins the cascade — env() resolves to 0 on web/
              Android, so this is exactly p-5's original 1.25rem there. */}
          <div
            ref={drawerRef}
            className={`relative flex flex-col w-64 max-w-xs h-full shadow-2xl px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))] z-50 justify-between drawer-enter-left bg-white/95 backdrop-blur-md border-r border-slate-200/50 rounded-r-2xl`}
            style={{
              fontFamily: platform === 'ios'
                ? '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif'
                : 'Roboto, sans-serif'
            }}
          >
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="font-bold text-lg tracking-tight text-orange-600">
                  DelCargo Menu
                </div>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded-full transition-colors text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Links */}
              <nav className="space-y-1">
                {mobileSideLinks.map(item => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  const showDot = (item.href.endsWith('/tickets') && hasUnseenTickets) || ((item.href.endsWith('/chat') || item.href.endsWith('/team-chats')) && hasUnseenChat);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                        isActive
                          ? 'bg-orange-50 text-orange-700'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="relative">
                        <Icon className={`h-4.5 w-4.5 shrink-0 ${
                          isActive ? 'text-orange-700' : 'text-slate-400'
                        }`} />
                        {showDot && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-rose-500 border border-white presence-dot" />}
                      </span>
                      {item.name}
                    </Link>
                  );
                })}

                {/* Policy Handbook link */}
                <Link
                  href={policyHref}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                    isPolicyActive
                      ? 'bg-orange-50 text-orange-700'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <BookOpen className={`h-4.5 w-4.5 shrink-0 ${
                    isPolicyActive ? 'text-orange-700' : 'text-slate-400'
                  }`} />
                  Policy Handbook
                </Link>
              </nav>
            </div>

            {/* Bottom Actions inside side menu */}
            <div className="pt-4 border-t border-slate-100">
              <button
                onClick={() => { setIsMobileMenuOpen(false); handleSignOut(); }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <LogOut className="h-4.5 w-4.5 shrink-0 text-rose-500" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
