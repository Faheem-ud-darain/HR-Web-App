'use client';
import React, { useEffect, useMemo, useState, useRef, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Users, UserPlus, Clock, LogOut, Wallet, ClipboardList, Star, BookOpen, Briefcase, HelpCircle, Menu, X, FileText, MapPin, Monitor, MessageSquare, MessageCircle, Radio, ChevronLeft, ChevronRight, UserCheck, BarChart3, Sparkles } from 'lucide-react';
import { hrActions, useProfiles, useTeams, useTrackingSettings, isTechnicalSupportMember, TrackingSettings } from '@/lib/hrData';
import { HR_ADMIN_LINE_TEAM_ID } from '@/lib/hr/shared';
import { clearSession } from '@/lib/session';
import { logoutPush } from '@/lib/push';
import { useAnyModalOpen } from '@/lib/modalStack';
import { triggerHaptic } from '@/lib/haptics';
import { useNavDots } from '@/lib/hr/activity';
import { useSessionEmail } from '@/lib/useSession';
import { useIsClient } from '@/lib/useIsClient';
import { isTrackingOn } from '@/lib/core/trackingSettings';

interface SidebarProps {
  role: 'admin' | 'hr' | 'employee' | 'team_lead';
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNavVisible, setIsNavVisible] = useState(true);
  const lastScrollY = useRef(0);

  // Auto-hide mobile bottom nav bar on scroll down, show on scroll up
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleScrollEvent = (e: Event) => {
      const target = e.target as HTMLElement | Document;
      let currentScrollY = 0;

      if (target === document || target === document.documentElement || (target as unknown) === window) {
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
  const [collapsedOverride, setCollapsedOverride] = useState<boolean | null>(null);
  const savedCollapsed = useSyncExternalStore(
    () => () => {},
    () => window.localStorage.getItem('sidebar_collapsed') === '1',
    () => false,
  );
  const isCollapsed = collapsedOverride ?? savedCollapsed;
  const toggleCollapsed = () => {
    const next = !isCollapsed;
    setCollapsedOverride(next);
    window.localStorage.setItem('sidebar_collapsed', next ? '1' : '0');
  };
  const userEmail = useSessionEmail() || '';
  const drawerRef = useRef<HTMLDivElement>(null);
  const { data: profiles } = useProfiles();
  const { data: allTeams } = useTeams();
  // Self-healing fallback: hr_profiles.tracking_enabled (which used to be
  // the only thing gating this nav link) can be out of sync with the real
  // "is screen tracking actually on" flag, which lives in this KV row
  // instead. Checking both means employees whose tracking was turned on
  // via the Tracking Monitor page before the two flags were kept in sync
  // still see the link, without HR/Admin needing to re-toggle anything.
  const { data: trackingSettingsRows } = useTrackingSettings();

  // Everything below is derived from the roster, the team list and the person's own
  // tracking settings — recomputed when they change, not copied into state by an effect.
  const me = useMemo(
    () => profiles?.find(p => p.email && userEmail && p.email.toLowerCase() === userEmail.toLowerCase()),
    [profiles, userEmail],
  );
  const isTeamLead = !!(me?.isTeamLead && (me.leadTeams?.length ?? 0) > 0);
  const mySettings = (trackingSettingsRows || []).find((s: TrackingSettings) => s.employeeEmail?.toLowerCase() === userEmail.toLowerCase());
  const trackingEnabled = isTrackingOn(me?.trackingEnabled, mySettings);
  // Admin is auto-a-member of every team channel (see TeamChatView), so their "unseen"
  // activity spans every team. HR has the same "every team" oversight (see
  // hr/team-chats/page.tsx) — hr_profiles.teams is normally empty for HR, so without
  // this they'd never show as unread. Everyone else: the teams they belong to or lead.
  const myTeamIds: string[] | 'all' = useMemo(() => {
    if (role === 'admin' || role === 'hr') return 'all';
    if (!me || !allTeams) return [];
    const names = new Set([...(me.teams || []), ...(me.leadTeams || [])]);
    return allTeams.filter(t => names.has(t.name)).map(t => t.id);
  }, [role, me, allTeams]);

  // Dynamic OS platform detection for iOS vs Android styling (browser only).
  const isClient = useIsClient();
  const detectedOs: 'ios' | 'android' | null = useMemo(() => {
    if (!isClient) return null;
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) return 'ios';
    if (/android/.test(ua)) return 'android';
    return null;
  }, [isClient]);
  const platform: 'ios' | 'android' = detectedOs ?? 'ios'; // desktop falls back to the iOS look
  useEffect(() => {
    if (!detectedOs) return;
    document.body.classList.toggle('platform-ios', detectedOs === 'ios');
    document.body.classList.toggle('platform-android', detectedOs === 'android');
  }, [detectedOs]);

  // Unseen-activity dots (Tickets / Team Chat / HR & Admin line). Driven by one tiny
  // "latest event" record per scope that is pushed live, instead of polling the full
  // ticket and message lists. A new event overwrites the previous one for its scope,
  // the person who caused it never gets a dot, and the page you have open is marked
  // seen as events arrive, so it never shows a dot for itself. See core/activity.ts.
  const dotViewer = React.useMemo(() => {
    if (!userEmail || !role) return null;
    const me = profiles?.find(p => p.email?.toLowerCase() === userEmail.toLowerCase());
    return {
      role,
      email: userEmail,
      technical: isTechnicalSupportMember(me?.teams),
      chatTeamIds: myTeamIds === 'all' ? (allTeams || []).map(t => t.id) : myTeamIds,
      hrAdminTeamId: HR_ADMIN_LINE_TEAM_ID,
    };
  }, [userEmail, role, profiles, myTeamIds, allTeams]);
  const dots = useNavDots(dotViewer, pathname);
  const hasUnseenTickets = dots.tickets;
  const hasUnseenChat = dots.chat;
  const hasUnseenHrAdmin = dots.hrAdmin;

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
    // Highest-priority item for hr/admin — HR & Admin's own private,
    // permanent line to each other (forwarded tickets/announcements/
    // messages land here too). Placed right under Overview, ahead of
    // every other feature, per the feature spec.
    { name: 'HR & Admin', href: '/admin/hr-admin', icon: Radio },
    { name: 'Warehouses', href: '/admin/warehouses', icon: MapPin },
    { name: 'Tasks', href: '/admin/tasks', icon: ClipboardList },
    { name: 'Leaves Approval', href: '/admin/leaves', icon: Clock },
    { name: 'Payroll & Salary', href: '/admin/payroll', icon: Wallet },
    { name: 'Attendance', href: '/admin/absences', icon: UserCheck },
    { name: 'Career Board', href: '/admin/careers', icon: Briefcase },
    { name: 'Master Reports', href: '/admin/reports', icon: FileText },
    { name: 'Insights', href: '/admin/insights', icon: BarChart3 },
    { name: 'Screen Tracking', href: '/admin/tracking', icon: Monitor },
    { name: 'Support Tickets', href: '/admin/tickets', icon: HelpCircle },
    { name: 'Team Chats', href: '/admin/team-chats', icon: MessageSquare },
    { name: 'Direct Messages', href: '/admin/direct-messages', icon: MessageCircle },
    { name: 'Del Assistant', href: '/admin/assistant', icon: Sparkles },

  ];

  const hrItems = [
    { name: 'HR Dashboard', href: '/hr', icon: LayoutDashboard },
    // See the identical comment on adminItems above.
    { name: 'HR & Admin', href: '/hr/hr-admin', icon: Radio },
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
    { name: 'Del Assistant', href: '/hr/assistant', icon: Sparkles },

  ];

  const employeeItems = [
    { name: 'My Dashboard', href: '/employee', icon: LayoutDashboard },
    ...(trackingEnabled ? [{ name: 'Timesheet Tracker', href: '/employee/tracker', icon: Clock }] : []),
    { name: 'My Leaves', href: '/employee/leaves', icon: Clock },
    { name: 'Attendance', href: '/employee/absences', icon: UserCheck },
    { name: 'Salary', href: '/employee/salary', icon: Wallet },
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
            const showDot = (item.href.endsWith('/tickets') && hasUnseenTickets) || ((item.href.endsWith('/chat') || item.href.endsWith('/team-chats')) && hasUnseenChat) || (item.href.endsWith('/hr-admin') && hasUnseenHrAdmin);
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
            const showDot = (item.href.endsWith('/tickets') && hasUnseenTickets) || ((item.href.endsWith('/chat') || item.href.endsWith('/team-chats')) && hasUnseenChat) || (item.href.endsWith('/hr-admin') && hasUnseenHrAdmin);
            
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
                  const showDot = (item.href.endsWith('/tickets') && hasUnseenTickets) || ((item.href.endsWith('/chat') || item.href.endsWith('/team-chats')) && hasUnseenChat) || (item.href.endsWith('/hr-admin') && hasUnseenHrAdmin);
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
