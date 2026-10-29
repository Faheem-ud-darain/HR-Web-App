'use client';

import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopNav } from '@/components/layout/TopNav';
import { useRouter, usePathname } from 'next/navigation';
import { Profile, useProfiles, useMyProfile } from '@/lib/hrData';
import { getSessionEmail, getSessionRole, clearSession, hydrateSessionFromNativeStorage, isValidRole, dashboardSectionForRole, SessionRole } from '@/lib/session';
import { initPush } from '@/lib/push';
import { Modal } from '@/components/ui/Modal';
import { AnnouncementPopup } from '@/components/ui/AnnouncementPopup';
import { AbsentPopup } from '@/components/ui/AbsentPopup';
import { MaintenanceNoticePopup } from '@/components/ui/MaintenanceNoticePopup';
import { ForcedPasswordChangeModal } from '@/components/ui/ForcedPasswordChangeModal';
import { PushPermissionPrompt } from '@/components/ui/PushPermissionPrompt';
import { NativeBackButtonHandler } from '@/components/layout/NativeBackButtonHandler';
import { useAnyModalOpen } from '@/lib/modalStack';
import { Button } from '@/components/ui/Button';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import { OnboardingFlow } from '@/components/layout/OnboardingFlow';
import { ApprovalGate } from '@/components/layout/onboarding/ApprovalGate';
import { ConsentOverlay } from '@/components/layout/ConsentOverlay';
import { FloatingAssistant } from '@/components/assistant/FloatingAssistant';

// Wraps each page's content for the tab-switch fade+rise animation. Split
// out into its own component (rather than inlining a `page-enter` class
// directly) so we can strip the class via onAnimationEnd once the 320ms
// entrance finishes.
//
// Why this matters: `.page-enter`'s keyframes end on `transform:
// translateY(0)`, and `animation-fill-mode: both` retains that computed
// style forever once the animation completes — not just during the brief
// entrance. Per the CSS spec, ANY non-`none` transform (even an identity
// translateY(0)) turns its element into a new containing block for every
// `position: fixed` descendant nested inside it. Since this div wraps every
// dashboard page's content, that silently broke every fixed-position overlay
// that isn't portaled straight to document.body (e.g. UserProfileModal's
// hand-rolled card, TrackingView's screenshot lightbox): instead of covering
// the true viewport, they got clipped to this div's box, while the mobile
// floating pill nav — a sibling of this div, not a descendant — kept
// rendering at the real (unclipped) viewport edge, on top of everything.
// Stripping the class after the animation ends removes the stuck transform
// and restores normal fixed-position behavior for the rest of the page's
// lifetime.
function PageTransition({ className, children }: { className: string; children: React.ReactNode }) {
  const [animating, setAnimating] = useState(true);
  return (
    <div
      onAnimationEnd={() => setAnimating(false)}
      className={`${className} ${animating ? 'page-enter' : ''}`}
    >
      {children}
    </div>
  );
}

// Lists that change rarely; they refresh on their own staleTime/polling, not on every resume.
const SLOW_CHANGING_QUERIES = new Set(['hr_profiles', 'hr_teams', 'hr_warehouses', 'hr_announcements', 'hr_maintenance_notices', 'hr_leaves']);
const RESUME_REFRESH_AFTER_MS = 30_000;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Widened to include 'team_lead' — it's a real value Profile.role/session
  // can hold (see src/lib/hrData.ts), not just 'admin' | 'hr' | 'employee'.
  // Sidebar already accepts it directly; anywhere this layout needs to
  // reason about *which dashboard section* a role belongs to (RBAC route
  // checks, onboarding/approval gates below) goes through
  // dashboardSectionForRole() instead of comparing this raw value, so
  // team_lead is never mistaken for "not employee".
  const [role, setRole] = useState<SessionRole | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  
  const [showConsent, setShowConsent] = useState(false);
  const [activePolicy, setActivePolicy] = useState<'conduct' | 'handbook' | 'privacy' | null>(null);

  const [dbReady, setDbReady] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  // Fixed 2026-08-18 — this used to only match '/chat' and '/team-chats',
  // so the Direct/HR Messages screens (which also render TeamChatView, just
  // with a single virtual DM channel) fell through to the default scrolling
  // page shell below instead of the full-height, non-scrolling one. Visual
  // symptom: the chat panel looked squeezed/pushed upward instead of filling
  // the screen the way Team Chat does, because its wrapper got `max-w-6xl`
  // + `overflow-y-auto` instead of `flex-1 h-full max-w-none` + `overflow-hidden`.
  const isChatScreen = pathname?.endsWith('/chat') || pathname?.endsWith('/team-chats') || pathname?.endsWith('/direct-messages');
  // Support Tickets has its own bottom-anchored reply composer, same as Team
  // Chat — the floating pill nav (Sidebar.tsx) now hides on both for the
  // same reason. Since neither screen needs to reserve space for that pill
  // anymore, they get a small fixed bottom breathing-room padding instead of
  // the large pb-24 other tabs use to clear it.
  const isTicketsScreen = pathname?.endsWith('/tickets');
  // Every page fills the width of the screen up to 1800px (so wide tables such as Screen Tracking and the
  // Payroll Ledger get real room too); beyond that the content stays centred, because lines of text and cards
  // stretched across an ultrawide monitor are harder to read, not easier.
  // When the ticket conversation panel is open it calls pushModal() (see
  // TicketsView.tsx) — subscribe to that signal so we can switch the tickets
  // screen's <main> to overflow-hidden while it's open. Without this, the
  // OS keyboard-avoidance sees a scrollable page behind the fixed panel and
  // tries to pan/resize the scroll container, pushing the whole panel up.
  // Identical fix to isChatScreen, which already uses overflow-hidden.
  const anyModalOpen = useAnyModalOpen();
  const isTicketPanelOpen = isTicketsScreen && anyModalOpen;

  const { data: allProfiles, isLoading: isProfilesLoading } = useProfiles();
  // The user's own profile arrives long before the full roster; the shell only needs this one.
  const { data: myProfile } = useMyProfile();

  // Redirect if unauthorized.
  //
  // IMPORTANT: this used to compare pathname against the *raw* profile.role,
  // which is broken for team_lead accounts — team_lead shares the /employee
  // dashboard (there is no /team_lead route), so `profile.role !== 'employee'`
  // was true for every team lead on their own dashboard, and
  // `router.push('/team_lead')` sent them to a route that doesn't exist
  // (a dead page, not a redirect to safety). Always resolve through
  // dashboardSectionForRole() first so this can only ever push to
  // '/admin', '/hr', or '/employee' — one of the three sections that
  // actually exist under this layout.
  useEffect(() => {
    if (!isProfilesLoading && profile && isValidRole(profile.role)) {
      const section = dashboardSectionForRole(profile.role);
      if (pathname.startsWith('/admin') && section !== 'admin') {
        router.push(`/${section}`);
      } else if (pathname.startsWith('/hr') && !['hr', 'admin'].includes(section)) {
        router.push(`/${section}`);
      } else if (pathname.startsWith('/employee') && section !== 'employee') {
        router.push(`/${section}`);
      }
    }
  }, [pathname, profile, isProfilesLoading, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // On native, restores localStorage from durable Preferences storage
      // first if the WebView's own copy went missing — see the big comment
      // in session.ts for why that can happen even with "Remember me"
      // checked. No-op on web, and a no-op here on every load after the
      // first (it only does anything when localStorage is actually empty).
      await hydrateSessionFromNativeStorage();
      if (cancelled) return;

      const rawRole = getSessionRole();
      const savedEmail = getSessionEmail();

      // Validate the role value itself, not just its presence — a
      // corrupted/stale/unknown role should be treated the same as "not
      // logged in" rather than being trusted and set into state, where it
      // could otherwise get handed to Sidebar or compared against pathnames
      // that don't account for it.
      if (!rawRole || !savedEmail || !isValidRole(rawRole)) {
        if (rawRole && !isValidRole(rawRole)) clearSession();
        router.push('/auth');
      } else {
        const savedRole = rawRole;
        setRole(savedRole);
        setEmail(savedEmail);

        // Ready as soon as EITHER the roster or just the user's own profile has arrived.
        if ((!isProfilesLoading && allProfiles) || myProfile) {
          setDbReady(true);
          const userProfile = allProfiles?.find(e => e && e.email && e.email.toLowerCase() === savedEmail.toLowerCase()) ?? myProfile ?? undefined;
          if (userProfile) {
            setProfile(userProfile);
          }

          // team_lead accounts go through the same onboarding/consent flow
          // as employee — they're employees first, lead status is layered
          // on top (see hrData.ts / Sidebar.tsx).
          if ((savedRole === 'employee' || savedRole === 'team_lead') && (!userProfile || !userProfile.onboardingCompleted)) {
            const consent = localStorage.getItem(`consent_accepted_${savedEmail}`);
            if (!consent) {
              setShowConsent(true);
            }
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [router, allProfiles, isProfilesLoading, myProfile]);

  // Register this device/browser for push notifications and link it to the
  // signed-in user (as OneSignal's "external ID") so they can be targeted
  // individually later, not just as part of a broadcast to everyone.
  // No-ops until an App ID is configured in src/lib/push.ts.
  useEffect(() => {
    if (email) initPush(email);
  }, [email]);

  // Two related staleness problems, one fix: React Query's
  // refetchOnWindowFocus is deliberately off (see providers.tsx) so
  // switching tabs/apps on desktop doesn't refire every active query, but
  // that meant NOTHING refreshed data when the native app came back from
  // the background — the bell, tickets, chat, etc. all sat on whatever was
  // last loaded until the app was fully killed and relaunched. The Page
  // Visibility API fires reliably in a Capacitor WebView on both iOS and
  // Android when the app is backgrounded/foregrounded (it's not a browser
  // tab from the WebView's perspective, but the same underlying event),
  // so listening for it here and invalidating every active query is a
  // Capacitor-app-appropriate substitute for refetchOnWindowFocus without
  // turning that global default back on for the desktop web case it was
  // presumably disabled for.
  //
  // Also re-runs initPush(email) on the same trigger — self-heals the case
  // where OneSignal's external_id login raced the push subscription being
  // created on a brand-new install (see the comment in push.ts's
  // initNative) by re-attempting the login every time the app resumes, not
  // just once at first launch.
  useEffect(() => {
    let hiddenAt = 0;
    const handleVisible = () => {
      if (document.visibilityState !== 'visible') { hiddenAt = Date.now(); return; }
      // Resuming used to invalidate EVERY query — roster, teams, warehouses,
      // announcements included — each time anyone switched back to the tab.
      // Now: nothing at all after a brief absence, and after a longer one only
      // the live data refreshes. Slow-changing lists keep their own staleTime/
      // polling and refetch when they're actually stale.
      const awayMs = hiddenAt ? Date.now() - hiddenAt : Infinity;
      if (awayMs >= RESUME_REFRESH_AFTER_MS) {
        queryClient.invalidateQueries({ predicate: q => !SLOW_CHANGING_QUERIES.has(String(q.queryKey[0])) });
      }
      if (email) initPush(email);
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () => document.removeEventListener('visibilitychange', handleVisible);
  }, [email, queryClient]);



  const handleConsentAccept = () => {
    if (email) {
      localStorage.setItem(`consent_accepted_${email}`, 'true');
      setShowConsent(false);
    }
  };

  if (!dbReady || !role || ((role === 'employee' || role === 'team_lead') && !profile)) {
    return (
      <DashboardSkeleton />
    );
  }

  // Force onboarding stepper gate if user is employee (or team_lead, who is
  // an employee first) and onboarding is incomplete
  if ((role === 'employee' || role === 'team_lead') && profile && !profile.onboardingCompleted) {
    return (
      <>
        <OnboardingFlow profile={profile} email={email} role={role} />
        {showConsent && <ConsentOverlay profile={profile} onAccept={handleConsentAccept} />}
      </>
    );
  }

  // Approval gate: onboarding stepper is done, but HR/Admin hasn't reviewed
  // the uploaded documents yet. Deliberately only fires for 'pending' or
  // 'rejected' — undefined (employees onboarded before this feature
  // existed) is left alone so nobody already using the app gets locked out.
  if ((role === 'employee' || role === 'team_lead') && profile && profile.onboardingCompleted && (profile.approvalStatus === 'pending' || profile.approvalStatus === 'rejected')) {
    return <ApprovalGate profile={profile} email={email} role={role} />;
  }

  return (
    <div className="flex h-screen bg-chrome overflow-hidden relative">
      <NativeBackButtonHandler />
      <Sidebar role={role} />
      {/* min-w-0 here too: this is itself a flex item of the row above
          (alongside Sidebar), and without it a wide descendant (e.g. the
          Careers tab's horizontally-scrollable job-card row) could force
          this whole column wider than the viewport, dragging the entire
          app shell into a page-wide horizontal pan instead of staying
          contained to that one row's own scroll area. overflow-x-hidden
          is a second, explicit guard against the same failure mode. */}
      <div className="flex flex-col flex-1 w-full min-w-0 overflow-hidden overflow-x-hidden">
        <TopNav />
        <main className={`flex-1 w-full min-w-0 overflow-x-hidden bg-app rounded-t-2xl ${
          isChatScreen
            ? 'overflow-hidden flex flex-col p-1.5 pb-2.5 md:px-6 lg:px-8 2xl:px-12 md:py-8'
            : isTicketPanelOpen
              // Ticket conversation panel is open — lock the scroll container
              // exactly like the chat screen so the OS keyboard does not try
              // to pan/resize this element (which pushed the fixed panel up).
              ? 'overflow-hidden flex flex-col p-0'
              : isTicketsScreen
                ? 'overflow-y-auto px-4 py-4 pb-2.5 md:px-6 lg:px-8 2xl:px-12 md:py-8'
                : 'overflow-y-auto px-3 py-4 sm:px-4 md:px-6 lg:px-8 2xl:px-12 md:py-8 pb-28 md:pb-8'
        }`}>
          {/* key={pathname} forces PageTransition to remount on every
              nav-tab switch so its animating state (and page-enter) resets
              and re-triggers each time, not just on first load — previously
              content swapped instantly with zero motion. */}
          <PageTransition key={pathname} className={`mx-auto w-full min-w-0 flex flex-col overflow-x-hidden ${isChatScreen ? 'flex-1 h-full max-w-none' : 'max-w-[1800px]'}`}>
            {children}
          </PageTransition>
        </main>
      </div>

      {/* Blocking "important" announcement popup — employee/team_lead only;
          HR/Admin are the ones posting these, they shouldn't get blocked by
          their own broadcast. See AnnouncementPopup.tsx for why this isn't
          built on the shared <Modal> (must not be dismissible except via its
          own Mark as Read button). */}
      {(role === 'employee' || role === 'team_lead') && (
        <AnnouncementPopup email={email} profile={profile} />
      )}

      {/* Explains a new no-call-no-show / inactivity absence the moment the
          employee it happened to logs in or refreshes — see AbsentPopup.tsx.
          Employee/team_lead only, same reasoning as AnnouncementPopup above:
          HR/Admin aren't the subject of this, they see everyone's absences
          on the dedicated Absent Details page instead. */}
      {(role === 'employee' || role === 'team_lead') && (
        <AbsentPopup email={email} />
      )}

      {/* Blocking System Maintenance Notice popup — see
          MaintenanceNoticePopup.tsx. Unlike AnnouncementPopup/AbsentPopup
          above, this is NOT gated to employee/team_lead only: HR and Admin
          can post these, but they're just as affected by the system going
          down as anyone else, so they see the popup too (no "you posted
          it, you're exempt" exception here). */}
      <MaintenanceNoticePopup email={email} />

      {/* Plan 013 step 2 — hard gate after onboarding approval or an
          admin-triggered password reset (see admin/profile/route.ts's
          approveOnboarding/resetPassword actions, which set the
          mustChangePassword overlay flag). Not role-gated, same reasoning
          as MaintenanceNoticePopup above — HR/Admin accounts go through
          the exact same approval/reset flow as anyone else. */}
      <ForcedPasswordChangeModal
        profile={profile}
        onChanged={() => {
          setProfile(prev => (prev ? { ...prev, mustChangePassword: false } : prev));
          queryClient.invalidateQueries({ queryKey: ['hr_profiles'] });
        }}
      />

      {/* Checks live OS notification permission on every login (not just
          once) and nags until it's turned back on — see
          PushPermissionPrompt.tsx. Applies to every role, not just
          employee/team_lead, since HR/Admin also rely on push for tickets
          and leave requests. */}
      <PushPermissionPrompt />

      {/* The AI assistant (plan 030): HR and Admin only. */}
      {(role === 'hr' || role === 'admin') && <FloatingAssistant role={role} />}

      {/* Consent Popup Overlay Gate */}
      {showConsent && <ConsentOverlay profile={profile} onAccept={handleConsentAccept} />}

      {activePolicy && (
        <Modal 
          isOpen 
          onClose={() => setActivePolicy(null)} 
          title={
            activePolicy === 'conduct' ? 'Code of Conduct' :
            activePolicy === 'handbook' ? 'Employee Handbook' :
            'Privacy & Data Policy'
          }
        >
          <div className="space-y-4 pt-1 font-sans text-xs text-slate-700 leading-relaxed font-semibold">
            {activePolicy === 'conduct' && (
              <p>
                DelCargo is committed to maintaining a workplace that is respectful, inclusive, and professional. 
                All staff members are expected to act with high integrity, communicate transparently across remote teams, 
                and report conflicts directly to HR coordinators. Performance reviews are executed periodically.
              </p>
            )}
            {activePolicy === 'handbook' && (
              <div className="space-y-2">
                <p>The Employee Handbook sets forth our workplace expectations, leave management timelines, and payroll processing parameters.</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Leave requests require 2 weeks notice except for emergency leaves.</li>
                  <li>Salary releases occur on the designated payouts schedules.</li>
                  <li>Annual promotion increments are calculated natively by regional status.</li>
                </ul>
              </div>
            )}
            {activePolicy === 'privacy' && (
              <p>
                Your privacy is paramount. Personal banking details, files, and location access records are kept strictly confidential. 
                Our monitoring systems verify workstation logs and geofencing checkpoints to maintain secure log chains. 
                Data processing complies with local regional standards.
              </p>
            )}
            <div className="flex justify-end pt-4 border-t border-slate-200 mt-4">
              <Button
                variant="primary"
                size="md"
                onClick={() => setActivePolicy(null)}
              >
                Close Policy
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/*
        Removed: SmartInactivityMonitor (the "desktop tracker agent
        inactive" push warning). It was mounted here in every logged-in
        dashboard — HR's, Admin's, and every employee's — each independently
        polling every open shift every 60s. Because its once-per-day
        de-dupe was keyed on that ONE browser's localStorage/sessionStorage,
        not a server-side lock, every open dashboard tab across the company
        would independently decide "I haven't alerted about this stale
        employee today" the first time it noticed — so one stale tracker
        could fan out into a push (and the hr_notifications write +
        OneSignal call behind it) from every open tab, hammering the
        PocketBase droplet. Deleted per explicit request rather than
        reworking it into a server-side/single-writer check, since the
        underlying "tracker agent is off" signal is already visible via
        TrackerHeartbeat/getCaptureHealth on the Tracking page.
      */}
    </div>
  );
}
