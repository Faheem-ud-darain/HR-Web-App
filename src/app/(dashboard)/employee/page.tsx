'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useProfiles, useMyProfile, useTimesheets, useAnnouncements, useWarehouses, useLeaves, useMyTasks, useTrackingSettings, hrActions, LeaveApplication, Profile, Task, Warehouse, Announcement, TimesheetEntry, TrackerHeartbeat, displayName, isAnnouncementForProfile, TRACKER_HEARTBEAT_GRACE_MS, usePayrollSelf } from '@/lib/hrData';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { AlertTriangle, WifiOff, Smartphone, Landmark, Loader2 } from 'lucide-react';
import { isMobileDevice, TRACKER_MIN_VERSION } from '@/lib/trackerSetup';
import { checkGeofence } from '@/lib/geofence';
import { watchLocation, GeoPoint, GeoWatchHandle } from '@/lib/backgroundGeolocation';
import { useRouter } from 'next/navigation';
import { formatDateNY } from '@/lib/timezone';
import { Button } from '@/components/ui/Button';
import { TASK_PRIORITY_STYLES, TASK_STATUS_STYLES, TASK_STATUS_LABELS } from '@/components/ui/StatusBadges';
import { TimesheetReviewModal } from "@/app/(dashboard)/employee/_components/TimesheetReviewModal";
import { EmployeeSidePanel } from "@/app/(dashboard)/employee/_components/EmployeeSidePanel";
import { EmployeeMainColumn } from "@/app/(dashboard)/employee/_components/EmployeeMainColumn";
import { ShiftControlCard } from "@/app/(dashboard)/employee/_components/ShiftControlCard";
import { useNow } from '@/lib/useNow';
import { useSessionEmail } from '@/lib/useSession';
import { isTrackingOn } from '@/lib/core/trackingSettings';

// Stable empties, so memos and effects that depend on them don't re-run every render.
const NO_ANNOUNCEMENTS: Announcement[] = [];
const NO_WAREHOUSES: Warehouse[] = [];
const NO_PROFILES: Profile[] = [];

export default function EmployeeDashboard() {
  const now = useNow(); // wall clock for due-date checks (see lib/useNow.ts)
  const { data: allProfiles } = useProfiles();
  // Own profile (small, fast) — lets this page and its own data requests start without waiting for the full roster.
  const { data: myProfile } = useMyProfile();
  // Own leaves only (all of them — the PTO balance needs the full history).
  const sessionEmail = useSessionEmail() || undefined;
  const myLeaveName = allProfiles?.find(p => p.email && p.email.toLowerCase() === (sessionEmail || '').toLowerCase())?.fullName ?? myProfile?.fullName;
  const { data: allLeaves } = useLeaves({ employeeName: myLeaveName ?? null });
  // Own net-payable figure only, via the authenticated self-only
  // /api/payroll/me route (see usePayrollSelf's comment in hrData.ts) — not
  // the public useProfiles()/usePayroll() combo, which would leak every
  // employee's base salary to this employee's browser just to show their
  // own number.
  const { data: payrollSelf } = usePayrollSelf();
  // Scoped to just this employee's own tasks server-side (see useMyTasks'
  // comment in hrData.ts) instead of fetching every task assigned to
  // everyone in the company and filtering to "mine" client-side.
  const { data: allTasks, refetch: refetchTasks } = useMyTasks(sessionEmail ?? null);
  const { data: allAnnouncements } = useAnnouncements();
  const { data: allWarehouses } = useWarehouses();
  // Own shifts only (server-side) — not the whole company's 60-day history.
  const { data: allTimesheets, refetch: refetchTimesheets } = useTimesheets({ email: sessionEmail, enabled: !!sessionEmail });
  // Live tracking-enabled source of truth, same hr_tracking_settings
  // collection Sidebar.tsx checks — hr_profiles.trackingEnabled can lag
  // behind this if tracking was toggled from the Tracking Monitor page, so
  // the Team Lead widget below checks both instead of trusting the profile
  // flag alone.
  const { data: trackingSettingsList = [] } = useTrackingSettings();
  const isTrackingLiveFor = (emp: Profile) =>
    isTrackingOn(emp.trackingEnabled, trackingSettingsList.find(s => s.employeeEmail?.toLowerCase() === emp.email?.toLowerCase()));

  const router = useRouter();
  // Everything below is derived from the queries above — not copied into state by an effect.
  const userProfile: Profile | null = useMemo(
    () => allProfiles?.find(e => e.email && sessionEmail && e.email.toLowerCase() === sessionEmail.toLowerCase()) || myProfile || null,
    [allProfiles, myProfile, sessionEmail],
  );
  const leaves: LeaveApplication[] = useMemo(
    () => (userProfile && allLeaves ? allLeaves.filter(l => l.employeeName === userProfile.fullName) : []),
    [allLeaves, userProfile],
  );
  // allTasks is already server-scoped to this employee via useMyTasks above — this filter is a
  // harmless no-op kept as a defensive safety net rather than assuming the server-side email
  // match is always exact.
  const myTasks: Task[] = useMemo(
    () => (userProfile && allTasks ? allTasks.filter(t => t.assignedEmail === userProfile.email) : []),
    [allTasks, userProfile],
  );
  const [searchQuery, setSearchQuery] = useState('');
  const announcements: Announcement[] = allAnnouncements ?? NO_ANNOUNCEMENTS;
  const warehouses: Warehouse[] = allWarehouses ?? NO_WAREHOUSES;
  const allEmployees: Profile[] = allProfiles ?? NO_PROFILES;
  // Snapshotted once per visit (not re-fetched after markAnnouncementsSeen
  // writes) so an announcement that was unread when this page loaded stays
  // visibly highlighted for the rest of this visit, instead of the
  // highlight vanishing the instant markAnnouncementsSeen's write lands —
  // same "seen on arrival, not seen on render" reasoning as the sidebar's
  // unseen ticket/chat dots.
  const [announcementReadMap, setAnnouncementReadMap] = useState<Record<string, string[]>>({});
  const announcementSeenRef = useRef(false);
  
  // Geofencing states
  const [shiftActive, setShiftActive] = useState(false);
  const [, setGeofenceStatus] = useState('Outside Geofence');
  // What the device reported ('requesting' = USA employee, GPS answer not in yet; 'idle' = not applicable).
  const [geoResult, setGeoPermission] = useState<'granted' | 'denied' | 'unsupported' | null>(null);
  const geoPermission: 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported' =
    geoResult ?? (userProfile?.region === 'USA' ? 'requesting' : 'idle');
  const [geoErrorMsg, setGeoErrorMsg] = useState('');
  const [liveDistance, setLiveDistance] = useState<{ meters: number; warehouseName: string; isInside: boolean } | null>(null);

  // Tracker-connection gate for manually-started shifts (Pakistan/remote
  // employees). If HR/Admin has screen tracking enabled for this employee,
  // they must have the desktop tracker app actually running/connected
  // before they're allowed to hit "Start Shift" — otherwise a shift could
  // run un-monitored simply because the employee never opened the tracker.
  // USA employees on automatic GPS-geofence clock-in are unaffected.
  const [trackerHeartbeat, setTrackerHeartbeat] = useState<TrackerHeartbeat | null>(null);
  const [showTrackerRequiredModal, setShowTrackerRequiredModal] = useState(false);
  const [showMobileBlockedModal, setShowMobileBlockedModal] = useState(false);
  // Fixed 2026-08-18 — a heartbeat-is-live check alone isn't enough to let
  // Start Shift through: an outdated tracker build can still answer pings
  // and heartbeats perfectly (that's exactly the alex@delcargo.us case —
  // v10, live heartbeat, zero screenshots for 6 days). Previously an
  // employee could leave that build's own "update required" popup sitting
  // open and just click Start Shift from here instead, and the dashboard
  // would happily start tracked time against a tracker that isn't actually
  // capturing anything current. See showTrackerUpdateRequiredModal below.
  const [showTrackerUpdateRequiredModal, setShowTrackerUpdateRequiredModal] = useState(false);
  // Added 2026-08-19, explicit request: block Start Shift when the connected
  // agent is answering pings/heartbeats but authenticating with a stale
  // agentToken — i.e. HR/Admin regenerated this employee's setup code, but
  // their desktop tracker app still has the OLD code pasted in. The agent
  // itself detects this (get_tracking_settings() finds no row matching its
  // token) and reports it in the heartbeat via lastCaptureError containing
  // "Setup token not recognized" (see hasStaleTrackerToken() in hrData.ts).
  // Previously this looked identical to "connected and up to date" from the
  // Start Shift button's point of view — pong/heartbeat both succeed, and
  // agentVersion can be current — so a shift could start while the desktop
  // tracker was silently incapable of ever recording a screenshot. This is
  // the exact zara@delcargo.us / alex@delcargo.us incident from
  // PROJECT_HISTORY.md.
  const [showTrackerReconnectRequiredModal, setShowTrackerReconnectRequiredModal] = useState(false);
  const [checkingTracker, setCheckingTracker] = useState(false);
  // Grace-period tracking for heartbeat-based auto-clock-out. Only clock out
  // if heartbeat has been dead > TRACKER_HEARTBEAT_GRACE_MS AND no quit intent
  // signal exists. Timestamp (ms) of when the heartbeat first went dead, or
  // null while the heartbeat is live.
  const [heartbeatFirstDeadAt, setHeartbeatFirstDeadAt] = useState<number | null>(null);
  // True while the ping/pong pre-flight handshake for Start Shift is running.
  const [pingingTracker, setPingingTracker] = useState(false);
  // Manual Start Shift is disallowed from ANY mobile device — phone/tablet
  // browser or the Capacitor-wrapped native app — regardless of whether
  // screen tracking is even enabled for this employee (explicit product
  // decision, 2026-09-04, after an employee was able to manually start an
  // untracked shift from a phone's mobile browser with zero warning: the
  // old gate only checked isNativeMobileApp(), which a regular mobile
  // browser sails straight through since it's indistinguishable from any
  // other browser tab). isMobileDevice() covers both. Kept the name
  // `isMobileApp` below since it's threaded through a lot of existing
  // JSX/logic — it now means "any mobile device", not just the app.
  const isMobileApp = isMobileDevice();
  const [showUnder8HourModal, setShowUnder8HourModal] = useState(false);
  const [under8HourDetails, setUnder8HourDetails] = useState<{ workedMinutes: number; remainingMinutes: number } | null>(null);

  // Popped up the moment the desktop tracker app tells the server it just
  // auto-ended this employee's shift because it was closed mid-shift (see
  // notify_shift_auto_stopped in agent_gui.py / getShiftStopSignal in
  // hrData.ts) — as opposed to the shift_auto_stopped_<email> localStorage
  // flag, which only surfaces this at the *next login*. This one shows
  // immediately if the dashboard happens to already be open in a browser.
  const [shiftStopModal, setShiftStopModal] = useState(false);
  // Which signal reason triggered the modal above — 'tracker_closed' (the
  // original case) or 'inactivity_absence' (37+ continuous idle minutes —
  // see ShiftStopSignal in hrData.ts). Drives which copy the modal shows.
  const [shiftStopReason, setShiftStopReason] = useState<'tracker_closed' | 'inactivity_absence'>('tracker_closed');

  const profileRef = useRef<Profile | null>(null);
  const warehousesRef = useRef<Warehouse[]>([]);
  const shiftActiveRef = useRef(false);
  const geoWatchRef = useRef<GeoWatchHandle | null>(null);
  // Current open shift's id + clockIn timestamp, kept current for the
  // pagehide beacon below (manual/non-USA shifts only) — a pagehide handler
  // can't afford to await a fresh getOpenShift() lookup as the tab is
  // actually closing, so this is refreshed synchronously wherever a manual
  // shift is started or discovered already-open.
  const openShiftRef = useRef<{ id: string; clockIn: string } | null>(null);
  // Guards the one-time "was this shift abandoned by a closed tab?" check
  // below so it only runs once per profile per page load, not on every
  // re-render triggered by a data refetch.
  const staleShiftCheckedForEmailRef = useRef<string | null>(null);

  // Detailed Task Modal state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Team Lead review tracker states
  const [selectedReviewEmp, setSelectedReviewEmp] = useState<Profile | null>(null);
  const [reviewEntries, setReviewEntries] = useState<TimesheetEntry[]>([]);

  const handleOpenReviewModal = (emp: Profile) => {
    setSelectedReviewEmp(emp);
    // Real, Supabase-synced shift history — visible regardless of which
    // device/region the employee actually clocked in from.
    const entries = (allTimesheets || [])
      .filter(t => t.employeeEmail.toLowerCase() === emp.email.toLowerCase())
      .sort((a, b) => (b.clockIn || '').localeCompare(a.clockIn || ''));
    setReviewEntries(entries);
  };

  // BUGFIX 2026-09-08: this dashboard was rendering every right-rail widget
  // (Announcements, My Team) in its final "empty" shape (a single italic
  // "No X found" line) the instant the page mounted, then popping the real
  // content in — sometimes a stack of several cards worth of height — the
  // moment this data actually arrived a beat later. Cloudflare Web
  // Analytics flagged this page with the worst Cumulative Layout Shift
  // score in the app (maximum possible shift value) for exactly this
  // reason. isInitialLoading mirrors the guard below so those widgets can
  // render a fixed-height skeleton instead of the empty state while
  // waiting, so the real content arriving doesn't shove anything else on
  // the page around.
  const isInitialLoading = !allProfiles || !allLeaves || !allTasks || !allAnnouncements || !allWarehouses || !allTimesheets;

  // Reconciles the shift state machine (shiftActive / geofenceStatus / the open-shift ref) with the
  // server's record of this person's shifts. The setState calls here are the point of the effect:
  // they mirror server state into a state machine that button clicks and geofence events also drive.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!allTimesheets) return;

    const profile = userProfile;
    if (profile) {
      const openShift = allTimesheets.find(t => t.employeeEmail.toLowerCase() === (profile.email).toLowerCase() && !t.clockOut);
      setShiftActive(!!openShift);
      if (openShift) {
        setGeofenceStatus(profile.region === 'USA' ? 'Inside Warehouse' : 'Shift Active');
        openShiftRef.current = { id: openShift.id, clockIn: openShift.clockIn };
        // First time this profile's dashboard load finds an already-open
        // manual shift, check whether it was actually abandoned (tab
        // closed, crashed, force-quit) rather than genuinely still running
        // — see closeStaleManualShiftIfAbandoned in hrData.ts.
        if (profile.region !== 'USA' && staleShiftCheckedForEmailRef.current !== profile.email) {
          staleShiftCheckedForEmailRef.current = profile.email;
          hrActions.closeStaleManualShiftIfAbandoned(profile).then(closed => {
            if (closed) {
              shiftActiveRef.current = false;
              setShiftActive(false);
              setGeofenceStatus('Shift Ended');
              openShiftRef.current = null;
              refetchTimesheets();
              setShiftStopModal(true);
            }
          }).catch(() => { /* best-effort */ });
        }
      } else {
        openShiftRef.current = null;
      }
    }
  }, [userProfile, allTimesheets, refetchTimesheets]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // The header search box (TopNav) broadcasts what's typed as a window event.
  useEffect(() => {
    const handleSearch = (e: Event) => {
      setSearchQuery((e as CustomEvent).detail || '');
    };
    window.addEventListener('globalSearch', handleSearch);
    return () => window.removeEventListener('globalSearch', handleSearch);
  }, []);

  // Keep refs in sync so the long-lived geolocation callback always reads
  // fresh data without needing to be re-registered on every render.
  useEffect(() => { profileRef.current = userProfile; }, [userProfile]);
  useEffect(() => { warehousesRef.current = warehouses; }, [warehouses]);
  useEffect(() => { shiftActiveRef.current = shiftActive; }, [shiftActive]);
  // The long-lived timers below depend only on who is signed in (their email/region), so they
  // aren't torn down and restarted whenever the profile object is re-created. They read the
  // newest profile / tracking check through these refs instead.
  const userEmail = userProfile?.email;
  const userRegion = userProfile?.region;
  const isTrackingLiveForRef = useRef(isTrackingLiveFor);
  useEffect(() => { isTrackingLiveForRef.current = isTrackingLiveFor; });

  // Poll the desktop tracker app's connection heartbeat. Uses a 15-minute
  // grace period before auto-clocking out — a dead heartbeat alone is NOT
  // enough to end a shift, because PocketBase timeouts (slow server, large
  // screenshot uploads) can make the heartbeat go stale without the tracker
  // actually closing. Only clock out when EITHER:
  //   (a) A deliberate quit intent signal (Signal 2) is present, OR
  //   (b) The heartbeat has been continuously dead for > 15 minutes (crash)
  useEffect(() => {
    if (!userEmail) return;
    let cancelled = false;
    const check = async () => {
      const hb = await hrActions.getTrackerHeartbeat(userEmail);
      if (cancelled) return;
      setTrackerHeartbeat(hb);

      const profile = profileRef.current;
      const trackingEnabled = !!profile && isTrackingLiveForRef.current(profile);
      const heartbeatDead = trackingEnabled && !hrActions.isHeartbeatLive(hb);

      if (!heartbeatDead) {
        // Heartbeat is live — reset the dead-since timer
        setHeartbeatFirstDeadAt(null);
        return;
      }

      // Heartbeat is dead — record the first time we saw it dead
      setHeartbeatFirstDeadAt(prev => prev ?? Date.now());

      if (!shiftActiveRef.current) return; // shift already ended

      // Check Signal 2: deliberate quit intent
      const quitIntent = await hrActions.getTrackerQuitIntent(userEmail);
      const quitIntentRecent = !!quitIntent?.timestamp &&
        (Date.now() - new Date(quitIntent.timestamp).getTime()) < TRACKER_HEARTBEAT_GRACE_MS;

      // Check grace period: has heartbeat been dead for > 15 min?
      const gracePeriodExpired = heartbeatFirstDeadAt !== null &&
        (Date.now() - heartbeatFirstDeadAt) > TRACKER_HEARTBEAT_GRACE_MS;

      if (!quitIntentRecent && !gracePeriodExpired) {
        // Server blip — do NOT clock out. Wait out the grace period.
        return;
      }

      // Deliberate quit confirmed OR grace period expired — clock out
      setShiftActive(false);
      setGeofenceStatus('Shift Ended');
      openShiftRef.current = null;
      await hrActions.clockOut(userEmail);
      await refetchTimesheets();
      // Clean up quit intent so it doesn't re-trigger on the next poll
      try { await hrActions.clearTrackerQuitIntent(userEmail); } catch { /* best-effort */ }
      setShiftStopReason('tracker_closed');
      setShiftStopModal(true);
      setHeartbeatFirstDeadAt(null);
    };
    check();
    const interval = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [userEmail, heartbeatFirstDeadAt, refetchTimesheets]);

  // Poll for a "tracker was just closed mid-shift" signal from the desktop
  // agent. Polls faster than the heartbeat check above (10s) since the
  // whole point is to feel immediate — the employee closed the app, so
  // they're looking right at their screen when it happens.
  useEffect(() => {
    if (!userEmail) return;
    let cancelled = false;
    const ackKey = `shift_stop_ack_${userEmail.toLowerCase()}`;
    const check = async () => {
      const signal = await hrActions.getShiftStopSignal(userEmail);
      if (cancelled || !signal?.timestamp) return;
      if (window.localStorage.getItem(ackKey) === signal.timestamp) return; // already shown
      window.localStorage.setItem(ackKey, signal.timestamp);
      // Only pop up if this tab still thought the shift was active — avoids
      // surfacing a stale signal for a shift that was already ended some
      // other way long before this tab loaded.
      if (shiftActiveRef.current) {
        setShiftActive(false);
        await refetchTimesheets();
        setShiftStopReason(signal.reason === 'inactivity_absence' ? 'inactivity_absence' : 'tracker_closed');
        setShiftStopModal(true);
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [userEmail, refetchTimesheets]);

  // Keeps the manual-shift tab heartbeat warm (see ShiftTabHeartbeat in
  // hrData.ts) for as long as this tab has a manual shift active and open —
  // starts the instant shiftActive flips true (whether from clicking Start
  // Shift just now, or from discovering an already-open shift on load that
  // passed the stale-shift check below) and stops the moment it flips
  // false. USA employees are governed by GPS geofencing instead and don't
  // need this at all.
  //
  // Also re-touches immediately on `visibilitychange` -> visible, not just
  // every 20s: while backgrounded, mobile OSes commonly throttle/suspend JS
  // timers, so the plain interval alone could leave the heartbeat looking
  // stale for a bit right after resuming even though the employee is back.
  // Belt-and-suspenders with the loosened SHIFT_TAB_HEARTBEAT_STALE_MS
  // above — see the comment there for the bug this pair of changes fixes.
  useEffect(() => {
    if (!userProfile?.email || userProfile.region === 'USA' || !shiftActive) return;
    const touch = () => { hrActions.touchShiftTabHeartbeat(userProfile.email); };
    touch();
    const interval = setInterval(touch, 20000);
    const handleVisible = () => { if (document.visibilityState === 'visible') touch(); };
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [userProfile?.email, userProfile?.region, shiftActive]);

  // Screen Wake Lock API — Keeps the tab alive and prevents system/browser
  // sleep mode while a shift is active, YouTube-style. Re-acquires automatically
  // when switching back to the tab.
  useEffect(() => {
    if (!shiftActive || typeof window === 'undefined' || !('wakeLock' in navigator)) return;
    let wakeLockSentinel: WakeLockSentinel | null = null;

    const requestWakeLock = async () => {
      try {
        if (document.visibilityState === 'visible' && !wakeLockSentinel) {
          wakeLockSentinel = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        // Wake lock can fail if low battery or disallowed by OS policy — fail gracefully
        console.warn('[ScreenWakeLock] Could not acquire wake lock:', err);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
        wakeLockSentinel = null;
      }
    };
  }, [shiftActive]);
  // affected employees turned out to be on the website, not the mobile
  // app, which doesn't even have Start/Stop Shift): Chrome/Edge's
  // background-tab memory-saving feature ("Memory Saver" / tab discarding)
  // silently unloads an inactive-but-not-closed tab to free RAM, and
  // reloading it when the employee switches back fires the exact same
  // `pagehide` event as a genuine close — which is what showed up as
  // employees' shifts randomly ending after an "auto page refresh" they
  // never asked for. There's no reliable way to tell a real close apart
  // from a discarded/reloaded tab using this event, so rather than keep
  // guessing, this fast path is turned off entirely — ending an abandoned
  // manual shift is now handled ONLY by the slower-but-safer
  // closeStaleManualShiftIfAbandoned stale-heartbeat check (runs at next
  // dashboard load, see the effect above and hrData.ts), which doesn't
  // fire on ordinary backgrounding/tab-discarding on any platform. Net
  // effect: a genuinely abandoned tab now takes up to
  // SHIFT_TAB_HEARTBEAT_STALE_MS (currently 15 minutes) to be caught
  // instead of being instant — a deliberate trade against the disruption
  // of false-positive shift-ends. beaconClockOut itself (hrData.ts) is
  // left in place, just unused, in case a safer trigger for it is found
  // later.
  //
  // useEffect(() => {
  //   if (!userProfile?.email || userProfile.region === 'USA') return;
  //   const handlePageHide = () => {
  //     if (!shiftActiveRef.current || !openShiftRef.current) return;
  //     hrActions.beaconClockOut(openShiftRef.current.id, openShiftRef.current.clockIn);
  //   };
  //   window.addEventListener('pagehide', handlePageHide);
  //   return () => window.removeEventListener('pagehide', handlePageHide);
  // }, [userProfile?.email, userProfile?.region]);

  // Real GPS-based geofencing — USA employees only. Automatically starts/ends
  // the shift as the employee's device enters or leaves the radius of any
  // warehouse assigned to them. Remote (Pakistan) employees use manual
  // Start/End Shift controls instead (rendered further below) and never
  // trigger this effect.
  //
  // watchLocation() (src/lib/backgroundGeolocation.ts) keeps this firing
  // even while the app is backgrounded/locked on native iOS/Android (via
  // @capgo/background-geolocation) — required so an employee who leaves a
  // warehouse without the app open still gets auto clocked-out. On plain
  // web it falls back to the browser's foreground-only geolocation, same as
  // before.
  useEffect(() => {
    if (!userEmail || userRegion !== 'USA') return;

    let cancelled = false;

    const handleSuccess = async (point: GeoPoint) => {
      if (cancelled) return;
      setGeoPermission('granted');
      setGeoErrorMsg('');

      const profile = profileRef.current;
      if (!profile) return;

      const assigned = warehousesRef.current.filter(w => profile.assignedWarehouses?.includes(w.id));
      if (assigned.length === 0) {
        setLiveDistance(null);
        return;
      }

      const { isInside, nearestWarehouse, distanceMeters } = checkGeofence(
        point.latitude,
        point.longitude,
        assigned
      );

      if (nearestWarehouse && distanceMeters !== null) {
        setLiveDistance({ meters: Math.round(distanceMeters), warehouseName: nearestWarehouse.name, isInside });
      }

      if (isInside && !shiftActiveRef.current && nearestWarehouse) {
        shiftActiveRef.current = true;
        setShiftActive(true);
        setGeofenceStatus(`Inside ${nearestWarehouse.name}`);
        await hrActions.clockIn(profile.email);
        await refetchTimesheets();
        await hrActions.addNotification(profile.email, 'employee', `Auto Shift ON: Checked-in at ${nearestWarehouse.name} via GPS geofencing.`);
        // 'shift' category + pushTitle/senderEmail so HR/Admin actually get a
        // push (with the employee's own profile picture as the Android large
        // icon, resolved server-side from senderEmail — see
        // push_notifications.pb.js), not just an in-app bell entry.
        {
          const shiftActorName = displayName(profile, 'hr');
          await hrActions.addNotification('all', 'hr', `${shiftActorName} checked-in at ${nearestWarehouse.name} via geofencing.`, 'shift', shiftActorName, profile.email);
          await hrActions.addNotification('all', 'admin', `${shiftActorName} checked-in at ${nearestWarehouse.name} via geofencing.`, 'shift', shiftActorName, profile.email);
        }
      } else if (!isInside && shiftActiveRef.current) {
        const whName = nearestWarehouse ? nearestWarehouse.name : 'the warehouse';
        shiftActiveRef.current = false;
        setShiftActive(false);
        setGeofenceStatus('Outside Geofence');
        await hrActions.clockOut(profile.email);
        await refetchTimesheets();
        await hrActions.addNotification(profile.email, 'employee', `Auto Shift OFF: Left the geofence at ${whName}.`);
        {
          const shiftActorName = displayName(profile, 'hr');
          await hrActions.addNotification('all', 'hr', `${shiftActorName} checked-out (left warehouse geofence at ${whName}).`, 'shift', shiftActorName, profile.email);
          await hrActions.addNotification('all', 'admin', `${shiftActorName} checked-out (left warehouse geofence at ${whName}).`, 'shift', shiftActorName, profile.email);
        }
      }
    };

    const handleError = (message: string, code?: string) => {
      if (cancelled) return;
      if (code === 'UNSUPPORTED') {
        setGeoPermission('unsupported');
        return;
      }
      setGeoPermission('denied');
      setGeoErrorMsg(
        code === 'NOT_AUTHORIZED'
          ? 'Location access denied. Enable "Always" location permission for Delcargo Internal in your device settings to allow automatic warehouse check-in.'
          : (message || 'Unable to determine your location.')
      );
    };

    watchLocation(handleSuccess, handleError).then((handle) => {
      if (cancelled) {
        handle.stop();
        return;
      }
      geoWatchRef.current = handle;
    });

    return () => {
      cancelled = true;
      geoWatchRef.current?.stop();
      geoWatchRef.current = null;
    };
  }, [userEmail, userRegion, refetchTimesheets]);

  const [isUpdatingTaskStatus, setIsUpdatingTaskStatus] = useState(false);
  const handleUpdateTaskStatus = async (taskId: string, nextStatus: Task['status']) => {
    if (isUpdatingTaskStatus) return;
    setIsUpdatingTaskStatus(true);
    try {
      await hrActions.updateTaskStatus(taskId, nextStatus);
      await refetchTasks();
      setSelectedTask(null);
    } finally {
      setIsUpdatingTaskStatus(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge variant="success">Approved</Badge>;
      case 'pending':
        return <Badge variant="warning">Pending</Badge>;
      case 'hr_approved':
        return <Badge variant="default">HR Approved</Badge>;
      case 'rejected':
        return <Badge variant="danger">Rejected</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  // Find my team details
  const myTeams = userProfile && userProfile.teams ? userProfile.teams : [];
  const teamMembers = (allProfiles || []).filter(emp => 
    emp.id !== userProfile?.id && 
    emp.teams && Array.isArray(emp.teams) &&
    emp.teams.some(t => myTeams.includes(t))
  );
  const teamLead = (allProfiles || []).find(emp => 
    emp.isTeamLead && 
    emp.leadTeams?.some(t => myTeams.includes(t))
  );

  // Overdue or due-within-3-days, not-done tasks — surfaced as a single
  // at-a-glance count in the stats row (replaces the old "Shift Status"
  // tile, which just duplicated the new Shift Control card above).
  const tasksNeedingAttention = myTasks.filter(t => {
    if (t.status === 'done') return false;
    if (now === 0) return false; // clock not known yet (server render / hydration)
    const daysUntil = (new Date(t.dueDate).getTime() - now) / (1000 * 3600 * 24);
    return daysUntil <= 3;
  }).length;

  // Filter announcements for current employee — shared with
  // AnnouncementPopup.tsx's blocking popup via isAnnouncementForProfile, so
  // the two can never silently disagree about who an announcement is for.
  const myAnnouncements = announcements.filter(ann => isAnnouncementForProfile(ann, userProfile));

  // Unread-announcement highlighting: snapshot the read map once per visit
  // (announcementSeenRef guards against re-snapshotting on background
  // refetches) so an announcement that was unread when the page loaded stays
  // visibly highlighted for the whole visit — see the state comment above.
  // markAnnouncementsSeen is safe to call every time this list changes since
  // it no-ops for anyone already recorded as having seen a given
  // announcement.
  useEffect(() => {
    const email = userProfile?.email;
    if (!email || myAnnouncements.length === 0) return;
    if (!announcementSeenRef.current) {
      announcementSeenRef.current = true;
      hrActions.getAnnouncementReadMap().then(setAnnouncementReadMap);
    }
    hrActions.markAnnouncementsSeen(myAnnouncements, email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myAnnouncements.length, userProfile?.email]);

  return (
    <div className="space-y-4 md:space-y-6 font-sans px-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white border border-slate-200 p-4 md:p-6 rounded-xl shadow-sm">
        <div className="flex items-center gap-3 md:gap-4">
          <Avatar src={userProfile?.profilePicture} name={userProfile?.fullName || 'Employee'} size={56} className="border-2 border-orange-500" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight" style={{ textWrap: 'balance' as React.CSSProperties['textWrap'] }}>{userProfile?.fullName || 'Employee'}</h1>
            <p className="text-xs text-slate-500 font-semibold">{userProfile?.jobTitle || 'Team Member'} · <span className="text-orange-600 font-bold">{userProfile?.region === 'USA' ? 'USA Operations' : 'Pakistan (Remote)'}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-200 px-3.5 py-2.5 md:py-2 rounded-xl font-bold text-slate-600">
          <Landmark className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          {userProfile?.bankName ? `${userProfile.bankName} (Verified)` : 'Bank details pending'}
        </div>
      </div>

      {/* Shift Control — this used to be split across a passive "Shift
          Status" stat tile up top AND a separate buried widget in the right
          rail mislabeled "Geofencing Tracker" (which didn't even apply to
          manual/Pakistan employees — there's no geofence for them, just a
          button). Starting/ending a shift is the single most frequent,
          highest-stakes action on this whole page, so it now gets one
          unmissable, honestly-labeled, full-width place instead of being
          buried under an unrelated heading in a sidebar. */}
      <ShiftControlCard shiftActive={shiftActive} userProfile={userProfile} geoPermission={geoPermission} liveDistance={liveDistance} isMobileApp={isMobileApp} setShowMobileBlockedModal={setShowMobileBlockedModal} isTrackingLiveFor={isTrackingLiveFor} setPingingTracker={setPingingTracker} setTrackerHeartbeat={setTrackerHeartbeat} setShowTrackerRequiredModal={setShowTrackerRequiredModal} setShowTrackerUpdateRequiredModal={setShowTrackerUpdateRequiredModal} setShowTrackerReconnectRequiredModal={setShowTrackerReconnectRequiredModal} setShiftActive={setShiftActive} setGeofenceStatus={setGeofenceStatus} openShiftRef={openShiftRef} refetchTimesheets={refetchTimesheets} setCheckingTracker={setCheckingTracker} checkingTracker={checkingTracker} pingingTracker={pingingTracker} allTimesheets={allTimesheets} setUnder8HourDetails={setUnder8HourDetails} setShowUnder8HourModal={setShowUnder8HourModal} geoErrorMsg={geoErrorMsg} trackerHeartbeat={trackerHeartbeat} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Left Column (8 cols): Stats, Tasks, Leaves */}
        <EmployeeMainColumn userProfile={userProfile} allLeaves={allLeaves} tasksNeedingAttention={tasksNeedingAttention} payrollSelf={payrollSelf} myTasks={myTasks} setSelectedTask={setSelectedTask} leaves={leaves} searchQuery={searchQuery} getStatusBadge={getStatusBadge} />

        {/* Right Column (4 cols): Announcements, Team, Referral — Shift
            Control moved to its own full-width card above the stats grid;
            see that section's comment for why. */}
        <EmployeeSidePanel isInitialLoading={isInitialLoading} myAnnouncements={myAnnouncements} userProfile={userProfile} announcementReadMap={announcementReadMap} allEmployees={allEmployees} isTrackingLiveFor={isTrackingLiveFor} handleOpenReviewModal={handleOpenReviewModal} teamLead={teamLead} teamMembers={teamMembers} router={router} />

      </div>

      {/* Mobile-blocked prompt — shown whenever Start Shift is attempted
          from a mobile device (phone/tablet browser or the native app),
          regardless of whether screen tracking is enabled for this
          employee. See isMobileDevice's comment in trackerSetup.ts for
          why this isn't scoped to tracked accounts only. */}
      {showMobileBlockedModal && (
        <Modal isOpen onClose={() => setShowMobileBlockedModal(false)} title="Desktop Required for This Shift">
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 p-4 rounded-xl">
              <Smartphone className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                Manual Start Shift isn&apos;t available on a phone or tablet. Please start your shift from a desktop or laptop browser instead.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShowMobileBlockedModal(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Tracker-required prompt — shown when Start Shift is blocked because
          screen tracking is enabled for this employee but the desktop agent
          isn't currently connected. */}
      {showTrackerRequiredModal && (
        <Modal isOpen onClose={() => setShowTrackerRequiredModal(false)} title="Tracker App Required">
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 p-4 rounded-xl">
              <WifiOff className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                Your account has screen tracking enabled by HR/Admin, so your shift can only be started once the DelCargo Tracker desktop app is installed and running. Open the app (check your system tray / menu bar if it&apos;s already installed) and try starting your shift again.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button
                variant="primary"
                size="md"
                onClick={() => router.push('/employee/tracker')}
              >
                Go to Tracker Setup
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShowTrackerRequiredModal(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Tracker-update-required prompt — shown when Start Shift is blocked
          because the connected desktop agent is live but running a build
          older than TRACKER_MIN_VERSION (see trackerSetup.ts). Distinct from
          showTrackerRequiredModal above, which is for "not connected at
          all" — this one is for "connected, but too old to trust." */}
      {showTrackerUpdateRequiredModal && (
        <Modal isOpen onClose={() => setShowTrackerUpdateRequiredModal(false)} title="Tracker Update Required">
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 p-4 rounded-xl">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                Your DelCargo Tracker app{trackerHeartbeat?.agentVersion ? ` (v${trackerHeartbeat.agentVersion})` : ''} is running but out of date — v{TRACKER_MIN_VERSION} or newer is required before you can start a tracked shift. Please update the app (it should prompt you automatically), then try starting your shift again.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button
                variant="primary"
                size="md"
                onClick={() => router.push('/employee/tracker')}
              >
                Go to Tracker Setup
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShowTrackerUpdateRequiredModal(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Stale-setup-code prompt — shown when Start Shift is blocked because
          the connected desktop agent is presenting an old agentToken that no
          longer matches hr_tracking_settings (the setup code was regenerated
          since this device was last configured). Distinct from both modals
          above: the agent IS running and IS current, it just can't
          authenticate — screen tracking silently cannot function until the
          employee re-pastes their new setup code. */}
      {showTrackerReconnectRequiredModal && (
        <Modal isOpen onClose={() => setShowTrackerReconnectRequiredModal(false)} title="Reconnect Tracker Required">
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 p-4 rounded-xl">
              <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                Your setup code was regenerated by HR/Admin, so your desktop tracker app is still using the old code and can no longer connect. Your shift can&apos;t start until you open your Tracker Setup page, copy the new setup code, and paste it into the DelCargo Tracker app on your computer.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button
                variant="primary"
                size="md"
                onClick={() => router.push('/employee/tracker')}
              >
                Go to Tracker Setup
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShowTrackerReconnectRequiredModal(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Tracker-closed-mid-shift OR inactivity-auto-absence notice — see the
          shift-stop-signal polling effect above. Blocking (no backdrop-click
          dismiss expected) since this is important enough that it shouldn't
          be missed by accident. */}
      {shiftStopModal && (
        <Modal
          isOpen
          onClose={() => setShiftStopModal(false)}
          title={shiftStopReason === 'inactivity_absence' ? 'Marked Absent — Shift Ended' : 'Tracker Closed — Shift Ended'}
        >
          <div className="space-y-4">
            <div className={`flex items-start gap-3 p-4 rounded-xl border ${shiftStopReason === 'inactivity_absence' ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
              <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${shiftStopReason === 'inactivity_absence' ? 'text-rose-600' : 'text-amber-600'}`} />
              <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                {shiftStopReason === 'inactivity_absence'
                  ? 'Your shift has been ended automatically because you were inactive for more than 35 continuous minutes. You have been marked absent for today and a deduction has been applied to your pay — see Absent Details for the exact amount. If you believe this is a mistake, contact HR.'
                  : "The DelCargo Tracker app on your computer was closed while your shift was active, so your shift has been automatically ended. If this wasn't intentional, reopen the tracker app and start a new shift to resume being tracked."}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button
                variant="primary"
                size="md"
                onClick={() => router.push(shiftStopReason === 'inactivity_absence' ? '/employee/absences' : '/employee/tracker')}
              >
                {shiftStopReason === 'inactivity_absence' ? 'View Absent Details' : 'Go to Tracker Setup'}
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShiftStopModal(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <Modal isOpen onClose={() => setSelectedTask(null)} title="Task Details">
          <div className="space-y-4">
            <div className="flex gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${TASK_PRIORITY_STYLES[selectedTask.priority]}`}>
                {selectedTask.priority} priority
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${TASK_STATUS_STYLES[selectedTask.status]}`}>
                {TASK_STATUS_LABELS[selectedTask.status]}
              </span>
            </div>
            
            <div>
              <h3 className="font-bold text-lg text-slate-900">{selectedTask.title}</h3>
              {selectedTask.description && (
                <p className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-wrap break-words">{selectedTask.description}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
              <div>
                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Due Date</p>
                <p className="font-semibold text-slate-800 mt-0.5">{formatDateNY(selectedTask.dueDate)}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Department</p>
                <p className="font-semibold text-slate-800 mt-0.5">{selectedTask.team}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              {selectedTask.status === 'todo' && (
                <button
                  onClick={() => handleUpdateTaskStatus(selectedTask.id, 'in_progress')}
                  disabled={isUpdatingTaskStatus}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 md:py-2 rounded-lg text-xs disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {isUpdatingTaskStatus && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Start Task
                </button>
              )}
              {selectedTask.status === 'in_progress' && (
                <button
                  onClick={() => handleUpdateTaskStatus(selectedTask.id, 'done')}
                  disabled={isUpdatingTaskStatus}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 md:py-2 rounded-lg text-xs disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {isUpdatingTaskStatus && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Mark Completed
                </button>
              )}
              <Button
                variant="outline"
                size="md"
                onClick={() => setSelectedTask(null)}
                disabled={isUpdatingTaskStatus}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Employee Activity & Timesheet Review Modal */}
      {selectedReviewEmp && (
        <Modal isOpen onClose={() => setSelectedReviewEmp(null)} title="Workstation Timesheet & Activity Review" className="md:max-w-3xl">
          <TimesheetReviewModal selectedReviewEmp={selectedReviewEmp} userProfile={userProfile} reviewEntries={reviewEntries} setSelectedReviewEmp={setSelectedReviewEmp} />
        </Modal>
      )}
      {/* Under 8 Hours heads-up — purely informational now (2026-09-01).
          By the time this can show, doClockOut() has already run and the
          shift is already ended; this used to be a confirmation GATE that
          blocked the actual clock-out until a second click, which is what
          let shifts silently stay open for up to 16 hours when an employee
          didn't notice/click through it. Never re-add a button here that
          the shift-ending action depends on. */}
      {showUnder8HourModal && under8HourDetails && (
        <Modal isOpen={showUnder8HourModal} onClose={() => setShowUnder8HourModal(false)} title="Shift Ended Under 8 Hours">
          <div className="space-y-4 font-sans text-xs">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-sm">Your shift has been ended.</p>
                <p className="text-amber-800 leading-relaxed font-medium">
                  It was under the required <strong>8 hours</strong> of total shift time for today — this may affect your pay for today. HR/Admin has also been notified.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center text-slate-700">
                <span className="font-semibold text-slate-500">Today&apos;s Total Shift Time:</span>
                <span className="font-bold font-mono text-sm text-slate-900">
                  {Math.floor(under8HourDetails.workedMinutes / 60)}h {under8HourDetails.workedMinutes % 60}m
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-700 pt-2 border-t border-slate-200">
                <span className="font-semibold text-amber-700">Short By:</span>
                <span className="font-bold font-mono text-sm text-amber-700">
                  {Math.floor(under8HourDetails.remainingMinutes / 60)}h {under8HourDetails.remainingMinutes % 60}m
                </span>
              </div>
            </div>

            <p className="text-slate-500 text-[11px] leading-relaxed">
              If your shift was split into multiple parts due to internet/app disconnections, your total worked time today is combined. If this looks wrong, contact HR.
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                onClick={() => setShowUnder8HourModal(false)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
