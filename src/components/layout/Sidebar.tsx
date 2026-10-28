'use client';
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { useProfiles, useTeams, useTrackingSettings, isTechnicalSupportMember, TrackingSettings } from '@/lib/hrData';
import { HR_ADMIN_LINE_TEAM_ID } from '@/lib/hr/shared';
import { useAnyModalOpen } from '@/lib/modalStack';
import { setMobileNavDot, setMobileNavOpen, useMobileNavOpen } from '@/lib/mobileNav';
import { useNavDots } from '@/lib/hr/activity';
import { useSessionEmail } from '@/lib/useSession';
import { isTrackingOn } from '@/lib/core/trackingSettings';
import { isChatScreen, navGroups, policyItem, quickLinks, type NavRole } from '@/lib/core/nav';
import { DesktopSidebar } from './sidebar/DesktopSidebar';
import { MobileMenu } from './sidebar/MobileMenu';
import { MobileTabBar } from './sidebar/MobileTabBar';
import { useHideOnScroll } from './sidebar/useHideOnScroll';

// The main navigation: a side menu that opens on hover on tablets and desktops, and a slide-in menu opened from the top
// bar's menu button on phones. What each role
// sees, and how it is grouped, is described in lib/core/nav; the pieces are in ./sidebar. This component only gathers
// what the menus need to know about the signed-in person.
export function Sidebar({ role }: { role: NavRole }) {
  const pathname = usePathname();
  const mobileOpen = useMobileNavOpen();
  const tabBarVisible = useHideOnScroll(pathname);

  // "Pin sidebar open" (desktop): keeps the menu open and moves the page over. Kept across visits.
  const [pinnedOverride, setPinnedOverride] = useState<boolean | null>(null);
  const savedPinned = useSyncExternalStore(
    () => () => {},
    () => window.localStorage.getItem('sidebar_pinned') === '1',
    () => false,
  );
  const pinned = pinnedOverride ?? savedPinned;
  const togglePinned = () => {
    setPinnedOverride(!pinned);
    window.localStorage.setItem('sidebar_pinned', pinned ? '0' : '1');
  };

  const userEmail = useSessionEmail() || '';
  const { data: profiles } = useProfiles();
  const { data: allTeams } = useTeams();
  // hr_profiles.tracking_enabled alone can be out of sync with the real "is screen tracking on" flag, which lives in the
  // tracking settings, so both are checked: an employee whose tracking was switched on from the Tracking Monitor still
  // sees the Timesheet Tracker link.
  const { data: trackingSettingsRows } = useTrackingSettings();

  // Everything below is derived from the roster, the team list and the person's own tracking settings.
  const me = useMemo(() => profiles?.find(p => p.email && userEmail && p.email.toLowerCase() === userEmail.toLowerCase()), [profiles, userEmail]);
  const isTeamLead = !!(me?.isTeamLead && (me.leadTeams?.length ?? 0) > 0);
  const mySettings = (trackingSettingsRows || []).find((s: TrackingSettings) => s.employeeEmail?.toLowerCase() === userEmail.toLowerCase());
  const trackingEnabled = isTrackingOn(me?.trackingEnabled, mySettings);

  // Admin is automatically in every team channel (see TeamChatView), so their "unseen" activity spans every team. HR has
  // the same "every team" oversight, and hr_profiles.teams is normally empty for HR. Everyone else: their own teams.
  const myTeamIds: string[] | 'all' = useMemo(() => {
    if (role === 'admin' || role === 'hr') return 'all';
    if (!me || !allTeams) return [];
    const names = new Set([...(me.teams || []), ...(me.leadTeams || [])]);
    return allTeams.filter(t => names.has(t.name)).map(t => t.id);
  }, [role, me, allTeams]);

  // Unseen-activity dots (Tickets / Team Chat / HR & Admin line). One tiny "latest event" record per scope is pushed
  // live, instead of polling the full ticket and message lists; the page you have open is marked seen as events arrive,
  // so it never shows a dot for itself. See core/activity.ts.
  const dotViewer = useMemo(() => {
    if (!userEmail || !role) return null;
    return {
      role,
      email: userEmail,
      technical: isTechnicalSupportMember(me?.teams),
      chatTeamIds: myTeamIds === 'all' ? (allTeams || []).map(t => t.id) : myTeamIds,
      hrAdminTeamId: HR_ADMIN_LINE_TEAM_ID,
    };
  }, [userEmail, role, me, myTeamIds, allTeams]);
  const dots = useNavDots(dotViewer, pathname);

  const groups = useMemo(() => navGroups(role, { trackingEnabled, isTeamLead }), [role, trackingEnabled, isTeamLead]);
  const quick = useMemo(() => quickLinks(role, { isTeamLead }), [role, isTeamLead]);
  const policy = policyItem(role);

  // The tab bar hides on the chat screens (they have their own full-height layout and a message box at the bottom)
  // and while any dialog or the menu is open, so it can never float on top of one: see modalStack.ts.
  const anyModalOpen = useAnyModalOpen();

  // The phone's menu button (in the top bar) shows a dot when any page in the menu has new activity, and the menu
  // folds away when you go to a page.
  const anyDot = dots.tickets || dots.chat || dots.hrAdmin;
  useEffect(() => { setMobileNavDot(anyDot); }, [anyDot]);
  useEffect(() => { setMobileNavOpen(false); }, [pathname]);

  return (
    <>
      <DesktopSidebar role={role} pathname={pathname} groups={groups} policy={policy} dots={dots} pinned={pinned} onTogglePinned={togglePinned} />
      {!isChatScreen(pathname) && !anyModalOpen && (
        <MobileTabBar role={role} pathname={pathname} quick={quick} dots={dots} visible={tabBarVisible} assistant={role === 'hr' || role === 'admin'} />
      )}
      <MobileMenu role={role} pathname={pathname} open={mobileOpen} onClose={() => setMobileNavOpen(false)} groups={groups} policy={policy} dots={dots} account={{ name: me?.fullName ?? userEmail.split('@')[0], picture: me?.profilePicture || null, email: userEmail || null }} />
    </>
  );
}
