'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  useProfiles, useTimesheets, useAnnouncements, useWarehouses, useLeaves, useTasks, usePayroll, useTeams,
  useKVByPrefix, hrActions, calculatePTOAccrued, getPTOAccrualDate, LeaveApplication, Profile, Task, Warehouse, TimesheetEntry,
  TrackingSettings, TrackerHeartbeat, localShiftDate, displayName, isAnnouncementForProfile, TRACKER_HEARTBEAT_GRACE_MS,
} from '@/lib/hrData';
import { getSessionEmail } from '@/lib/session';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { Clock, CheckCircle2, ChevronRight, AlertTriangle, Briefcase, Calendar, User, Flag, Monitor, MapPin, LocateFixed, Wifi, WifiOff, Smartphone, Landmark, Gift, Star, Loader2 } from 'lucide-react';
import { isNativeMobileApp } from '@/lib/trackerSetup';
import { checkGeofence } from '@/lib/geofence';
import { watchLocation, GeoPoint, GeoWatchHandle } from '@/lib/backgroundGeolocation';
import { useRouter } from 'next/navigation';
import { formatTimeNY, formatDateNY } from '@/lib/timezone';

const PRIORITY_STYLES: Record<Task['priority'], string> = {
  high:   'bg-rose-100 text-rose-800 border-rose-200',
  medium: 'bg-orange-100 text-orange-800 border-orange-200',
  low:    'bg-slate-100 text-slate-600 border-slate-200',
};

const STATUS_STYLES: Record<Task['status'], string> = {
  todo:        'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  done:        'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const STATUS_LABELS: Record<Task['status'], string> = {
  todo:        'To Do',
  in_progress: 'In Progress',
  done:        'Done',
};

export default function EmployeeDashboard() {
  const { data: allProfiles } = useProfiles();
  const { data: allLeaves } = useLeaves();
  const { data: allTasks, refetch: refetchTasks } = useTasks();
  const { data: allAnnouncements } = useAnnouncements();
  const { data: allWarehouses } = useWarehouses();
  const { data: allTimesheets, refetch: refetchTimesheets } = useTimesheets();
  const { data: allPayroll } = usePayroll();
  const { data: allTeams } = useTeams();
  // Live tracking-enabled source of truth, same KV row Sidebar.tsx checks —
  // hr_profiles.trackingEnabled can lag behind this if tracking was toggled
  // from the Tracking Monitor page, so the Team Lead widget below checks
  // both instead of trusting the profile flag alone.
  const { data: trackingSettingsRows } = useKVByPrefix('hr_tracking_settings_prod_v1');
  const trackingSettingsList = ((trackingSettingsRows || []).find(r => r.key === 'hr_tracking_settings_prod_v1')?.value as TrackingSettings[]) || [];
  const isTrackingLiveFor = (emp: Profile) =>
    !!emp.trackingEnabled || !!trackingSettingsList.find(s => s.employeeEmail?.toLowerCase() === emp.email?.toLowerCase())?.enabled;

  const router = useRouter();
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // New States
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [allEmployees, setAllEmployees] = useState<Profile[]>([]);
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
  const [geofenceStatus, setGeofenceStatus] = useState('Outside Geofence');
  const [geoPermission, setGeoPermission] = useState<'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported'>('idle');
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
  const [checkingTracker, setCheckingTracker] = useState(false);
  // Grace-period tracking for heartbeat-based auto-clock-out. Only clock out
  // if heartbeat has been dead > TRACKER_HEARTBEAT_GRACE_MS AND no quit intent
  // signal exists. Timestamp (ms) of when the heartbeat first went dead, or
  // null while the heartbeat is live.
  const [heartbeatFirstDeadAt, setHeartbeatFirstDeadAt] = useState<number | null>(null);
  // True while the ping/pong pre-flight handshake for Start Shift is running.
  const [pingingTracker, setPingingTracker] = useState(false);
  // The desktop tracker agent (screenshots/activity monitoring) can only
  // ever run on a Windows/Mac desktop — never inside the Capacitor-wrapped
  // native mobile app. So if HR/Admin has screen tracking enabled for this
  // employee, a shift must not be startable from the mobile app at all,
  // regardless of tracker-connection state — there's no desktop to connect.
  const isMobileApp = isNativeMobileApp();
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

  useEffect(() => {
    if (!allProfiles || !allLeaves || !allTasks || !allAnnouncements || !allWarehouses || !allTimesheets) return;

    const email = getSessionEmail();
    const employees = allProfiles;
    const profile = employees.find(e => e.email && email && e.email.toLowerCase() === email.toLowerCase());
    if (profile) {
      setUserProfile(profile);
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
    
    setAllEmployees(employees);
    setAnnouncements(allAnnouncements);
    setWarehouses(allWarehouses);
    if (profile) {
      setLeaves(allLeaves.filter(l => l.employeeName === profile.fullName) as any);
      setMyTasks(allTasks.filter(t => t.assignedEmail === profile.email));
    }

    const handleSearch = (e: Event) => {
      setSearchQuery((e as CustomEvent).detail || '');
    };
    window.addEventListener('globalSearch', handleSearch);
    return () => window.removeEventListener('globalSearch', handleSearch);
  }, [allProfiles, allLeaves, allTasks, allAnnouncements, allWarehouses, allTimesheets]);

  // Keep refs in sync so the long-lived geolocation callback always reads
  // fresh data without needing to be re-registered on every render.
  useEffect(() => { profileRef.current = userProfile; }, [userProfile]);
  useEffect(() => { warehousesRef.current = warehouses; }, [warehouses]);
  useEffect(() => { shiftActiveRef.current = shiftActive; }, [shiftActive]);

  // Poll the desktop tracker app's connection heartbeat. Uses a 15-minute
  // grace period before auto-clocking out — a dead heartbeat alone is NOT
  // enough to end a shift, because PocketBase timeouts (slow server, large
  // screenshot uploads) can make the heartbeat go stale without the tracker
  // actually closing. Only clock out when EITHER:
  //   (a) A deliberate quit intent signal (Signal 2) is present, OR
  //   (b) The heartbeat has been continuously dead for > 15 minutes (crash)
  useEffect(() => {
    if (!userProfile?.email) return;
    let cancelled = false;
    const check = async () => {
      const hb = await hrActions.getTrackerHeartbeat(userProfile.email);
      if (cancelled) return;
      setTrackerHeartbeat(hb);

      const trackingEnabled = isTrackingLiveFor(userProfile);
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
      const quitIntent = await hrActions.getTrackerQuitIntent(userProfile.email);
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
      await hrActions.clockOut(userProfile.email);
      await refetchTimesheets();
      // Clean up quit intent so it doesn't re-trigger on the next poll
      try { await hrActions.clearTrackerQuitIntent(userProfile.email); } catch { /* best-effort */ }
      setShiftStopReason('tracker_closed');
      setShiftStopModal(true);
      setHeartbeatFirstDeadAt(null);
    };
    check();
    const interval = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [userProfile?.email, heartbeatFirstDeadAt]);

  // Poll for a "tracker was just closed mid-shift" signal from the desktop
  // agent. Polls faster than the heartbeat check above (10s) since the
  // whole point is to feel immediate — the employee closed the app, so
  // they're looking right at their screen when it happens.
  useEffect(() => {
    if (!userProfile?.email) return;
    let cancelled = false;
    const ackKey = `shift_stop_ack_${userProfile.email.toLowerCase()}`;
    const check = async () => {
      const signal = await hrActions.getShiftStopSignal(userProfile.email);
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
  }, [userProfile?.email]);

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
    let wakeLockSentinel: any = null;

    const requestWakeLock = async () => {
      try {
        if (document.visibilityState === 'visible' && !wakeLockSentinel) {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
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
    if (!userProfile || userProfile.region !== 'USA') return;

    let cancelled = false;
    setGeoPermission('requesting');

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
  }, [userProfile?.email, userProfile?.region]);

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
    const daysUntil = (new Date(t.dueDate).getTime() - Date.now()) / (1000 * 3600 * 24);
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
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight" style={{ textWrap: 'balance' as any }}>{userProfile?.fullName || 'Employee'}</h1>
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
      <Card className={`border-2 transition-colors ${shiftActive ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-white'}`}>
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${shiftActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                <Flag className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${shiftActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                  <p className={`font-display font-bold text-lg tracking-tight ${shiftActive ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {shiftActive ? 'On Shift' : 'Off Shift'}
                  </p>
                </div>
                <p className="text-xs text-slate-500 font-semibold mt-0.5 truncate">
                  {userProfile?.region === 'USA'
                    ? (geoPermission === 'unsupported' || geoPermission === 'denied'
                        ? 'Automatic GPS check-in unavailable — see details below'
                        : liveDistance
                          ? `${liveDistance.isInside ? 'Inside' : `${liveDistance.meters}m from`} ${liveDistance.warehouseName} · auto check-in`
                          : 'Waiting for GPS signal to auto check-in…')
                    : 'Manual shift control — start and end your shift below'}
                </p>
              </div>
            </div>

            {/* USA employees: fully automatic, no manual control — the
                button real-estate instead explains that plainly so it
                doesn't read as "missing" a Start Shift button. */}
            {userProfile?.region === 'USA' ? (
              <div className="shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-1.5">
                <LocateFixed className="h-3.5 w-3.5" /> Auto Geofencing
              </div>
            ) : (
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={async () => {
                    if (!userProfile?.email) return;

                    // Mobile block — tracker can't run on mobile at all
                    if (isTrackingLiveFor(userProfile) && isMobileApp) {
                      setShowMobileBlockedModal(true);
                      return;
                    }

                    if (isTrackingLiveFor(userProfile)) {
                      // ── Ping/Pong Handshake (Signals 3 + 4) ───────────────
                      // Write a ping to PocketBase; the tracker agent detects
                      // it via realtime SSE and writes back a pong within ~1s.
                      // This is more reliable than reading cached heartbeat,
                      // which can be stale due to server timeouts.
                      setPingingTracker(true);
                      const requestId = Math.random().toString(36).slice(2) + Date.now().toString(36);

                      try {
                        // Clean up any stale pong from a previous attempt
                        await hrActions.clearTrackerPong(userProfile.email);
                        await hrActions.writeTrackerPing(userProfile.email, requestId);
                      } catch {
                        // Can't write ping — server issue, fall back to heartbeat
                        const freshHb = await hrActions.getTrackerHeartbeat(userProfile.email).catch(() => null);
                        setTrackerHeartbeat(freshHb ?? null);
                        setPingingTracker(false);
                        hrActions.clearTrackerPing(userProfile.email).catch(() => {});
                        if (!hrActions.isHeartbeatLive(freshHb)) {
                          setShowTrackerRequiredModal(true);
                        }
                        return;
                      }

                      // Poll for pong every 500ms, give up after 8 seconds
                      const POLL_MS = 500;
                      const TIMEOUT_MS = 8000;
                      let elapsed = 0;
                      let pongReceived = false;
                      while (elapsed < TIMEOUT_MS) {
                        await new Promise(r => setTimeout(r, POLL_MS));
                        elapsed += POLL_MS;
                        try {
                          const pong = await hrActions.getTrackerPong(userProfile.email);
                          if (pong?.requestId === requestId) {
                            pongReceived = true;
                            break;
                          }
                        } catch { /* ignore poll errors, keep trying */ }
                      }

                      // Clean up ping and pong keys regardless of outcome
                      hrActions.clearTrackerPing(userProfile.email).catch(() => {});
                      hrActions.clearTrackerPong(userProfile.email).catch(() => {});
                      setPingingTracker(false);

                      if (!pongReceived) {
                        // No response — tracker is not running
                        setShowTrackerRequiredModal(true);
                        return;
                      }
                      // Tracker confirmed live — proceed
                    }

                    // ── Clock In ────────────────────────────────────────────
                    setShiftActive(true);
                    setGeofenceStatus('Shift Active');
                    const started = await hrActions.clockIn(userProfile.email);
                    openShiftRef.current = { id: started.id, clockIn: started.clockIn };
                    await hrActions.touchShiftTabHeartbeat(userProfile.email);
                    await refetchTimesheets();
                    await hrActions.addNotification(userProfile.email, 'employee', 'Shift started manually. Screen tracking is now active for this shift.');
                    {
                      const shiftActorName = displayName(userProfile, 'hr');
                      await hrActions.addNotification('all', 'hr', `${shiftActorName} started shift manually.`, 'shift', shiftActorName, userProfile.email);
                      await hrActions.addNotification('all', 'admin', `${shiftActorName} started shift manually.`, 'shift', shiftActorName, userProfile.email);
                    }
                  }}
                  disabled={
                    shiftActive ||
                    checkingTracker ||
                    pingingTracker ||
                    (!!userProfile && isTrackingLiveFor(userProfile) && isMobileApp)
                    // Heartbeat-dead no longer disables the button — the ping/pong
                    // handshake in onClick is the authoritative live check now.
                  }
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2.5 px-5 rounded-xl text-sm transition-colors transition-transform active:scale-97 shadow-sm"
                >
                  {pingingTracker ? 'Connecting to tracker…' : checkingTracker ? 'Checking tracker…' : 'Start Shift'}
                </button>
                <button
                  onClick={async () => {
                    if (!userProfile?.email) return;

                    const doClockOut = async () => {
                      setShiftActive(false);
                      setGeofenceStatus('Shift Ended');
                      openShiftRef.current = null;
                      await hrActions.clockOut(userProfile.email);
                      await refetchTimesheets();
                      await hrActions.addNotification(userProfile.email, 'employee', 'Shift ended manually. Screen tracking has stopped.');
                      {
                        const shiftActorName = displayName(userProfile, 'hr');
                        await hrActions.addNotification('all', 'hr', `${shiftActorName} ended shift manually.`, 'shift', shiftActorName, userProfile.email);
                        await hrActions.addNotification('all', 'admin', `${shiftActorName} ended shift manually.`, 'shift', shiftActorName, userProfile.email);
                      }
                    };

                    // Calculate total worked shift minutes for today (including completed shifts and current open shift)
                    const todayStr = localShiftDate(new Date().toISOString());
                    const myTodayShifts = (allTimesheets || []).filter(t => 
                      t.employeeEmail.toLowerCase() === userProfile.email.toLowerCase() &&
                      localShiftDate(t.clockIn, t.date) === todayStr
                    );

                    let totalWorkedMs = 0;
                    const nowMs = Date.now();
                    for (const shift of myTodayShifts) {
                      const startMs = new Date(shift.clockIn).getTime();
                      if (shift.clockOut) {
                        const endMs = new Date(shift.clockOut).getTime();
                        totalWorkedMs += Math.max(0, endMs - startMs);
                      } else {
                        totalWorkedMs += Math.max(0, nowMs - startMs);
                      }
                    }

                    const totalWorkedMins = Math.floor(totalWorkedMs / 60000);
                    const REQUIRED_SHIFT_MINUTES = 8 * 60; // 480 minutes

                    if (totalWorkedMins < REQUIRED_SHIFT_MINUTES) {
                      setUnder8HourDetails({
                        workedMinutes: totalWorkedMins,
                        remainingMinutes: REQUIRED_SHIFT_MINUTES - totalWorkedMins,
                      });
                      setShowUnder8HourModal(true);
                      return;
                    }

                    await doClockOut();
                  }}
                  disabled={!shiftActive}
                  className="bg-white hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed text-rose-600 border border-rose-200 font-bold py-2.5 px-5 rounded-xl text-sm transition-colors transition-transform active:scale-97"
                >
                  End Shift
                </button>
              </div>
            )}
          </div>

          {/* Diagnostic / secondary detail — tucked below the primary
              status+action row instead of competing with it for attention.
              This is exactly the stuff that used to be the WHOLE widget. */}
          {userProfile?.region === 'USA' ? (
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-1.5">
              {(!userProfile.assignedWarehouses || userProfile.assignedWarehouses.length === 0) ? (
                <p className="text-[10px] text-slate-400 italic">No warehouses assigned by HR yet — geofenced check-in will activate once a warehouse is assigned to your profile.</p>
              ) : geoPermission === 'unsupported' ? (
                <p className="text-[10px] text-rose-600 font-semibold leading-relaxed">Your browser/device does not support GPS location. Automatic geofenced check-in is unavailable here — please use a modern mobile or desktop browser.</p>
              ) : geoPermission === 'denied' ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-rose-700 font-semibold leading-relaxed">{geoErrorMsg}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="shrink-0 bg-rose-600 hover:bg-rose-700 text-white font-bold py-1.5 px-3 rounded-lg text-[10px] transition-colors transition-transform active:scale-97"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <p className="text-[9px] text-slate-400 leading-relaxed">Your shift starts and ends automatically as you enter or leave an assigned warehouse's geofence — no manual check-in needed.</p>
              )}
            </div>
          ) : (
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
              {userProfile && isTrackingLiveFor(userProfile) && isMobileApp && !shiftActive && (
                <div className="flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[10px] font-bold bg-rose-50 border-rose-200 text-rose-700">
                  <Smartphone className="h-3 w-3 shrink-0" />
                  Screen tracking is enabled for your account — shifts can only be started from a desktop computer, not the mobile app.
                </div>
              )}
              {userProfile && isTrackingLiveFor(userProfile) && !isMobileApp && !shiftActive && (
                <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[10px] font-bold ${hrActions.isHeartbeatLive(trackerHeartbeat) ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                  {hrActions.isHeartbeatLive(trackerHeartbeat) ? <Wifi className="h-3 w-3 shrink-0" /> : <WifiOff className="h-3 w-3 shrink-0" />}
                  {hrActions.isHeartbeatLive(trackerHeartbeat)
                    ? 'Tracker app connected — you can start your shift.'
                    : 'Tracker app not detected in recent check. Make sure it\'s running — we\'ll verify live before starting your shift.'}
                </div>
              )}
              <p className="text-[9px] text-slate-400 leading-relaxed">
                If your account has screen tracking configured by HR/Admin, starting a shift activates it for the duration of your shift; ending your shift turns it off.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Left Column (8 cols): Stats, Tasks, Leaves */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card className="col-span-1 sm:col-span-1 stagger-item" style={{ animationDelay: '0ms' }}>
              <CardContent className="pt-4 md:pt-5 px-3 md:px-5">
                <div className="flex flex-col-reverse md:flex-row md:items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] md:text-xs font-semibold text-slate-500">Leave Balance</p>
                    <p className="text-xl md:text-2xl font-bold text-slate-900 mt-0.5 md:mt-1 tracking-tight">
                      {userProfile ? Math.max(0, calculatePTOAccrued(getPTOAccrualDate(userProfile)) - (allLeaves || []).filter(l => l.employeeName === userProfile.fullName && l.status === 'approved' && ['PTO', 'Sick Leave'].includes(l.type)).length) : 0} <span className="text-xs md:text-base font-medium">Days</span>
                    </p>
                  </div>
                  <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 self-end md:self-auto">
                    <Clock className="h-4 w-4 md:h-5 md:w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="col-span-1 sm:col-span-1 stagger-item" style={{ animationDelay: '50ms' }}>
              <CardContent className="pt-4 md:pt-5 px-3 md:px-5">
                <div className="flex flex-col-reverse md:flex-row md:items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] md:text-xs font-semibold text-slate-500">Accrued</p>
                    <p className="text-xl md:text-2xl font-bold text-slate-900 mt-0.5 md:mt-1 tracking-tight">
                      {userProfile ? calculatePTOAccrued(getPTOAccrualDate(userProfile)) : 0} <span className="text-xs md:text-base font-medium">Days</span>
                    </p>
                  </div>
                  <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 self-end md:self-auto">
                    <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="col-span-2 sm:col-span-1 stagger-item" style={{ animationDelay: '100ms' }}>
              <CardContent className="pt-4 md:pt-5 px-4 md:px-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Tasks Needing Attention</p>
                    <p className={`text-2xl font-bold mt-1 tracking-tight ${tasksNeedingAttention > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                      {tasksNeedingAttention} {tasksNeedingAttention === 1 ? 'Task' : 'Tasks'}
                    </p>
                  </div>
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${tasksNeedingAttention > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-400'}`}>
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tasks list */}
          {myTasks.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-1.5">My Assigned Tasks ({myTasks.length})</h2>
              <div className="space-y-2">
                {myTasks.map(task => {
                  const isOverdue = task.status !== 'done' && new Date(task.dueDate) < new Date();
                  const isDueSoon = !isOverdue && task.status !== 'done' && (new Date(task.dueDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24) <= 3;
                  return (
                    <Card 
                      key={task.id} 
                      onClick={() => setSelectedTask(task)}
                      className={`p-4 border transition-colors transition-shadow cursor-pointer hover:border-orange-300 hover:shadow-sm group ${isOverdue ? 'border-rose-300 bg-rose-50/10' : task.status === 'done' ? 'opacity-70 border-emerald-100 bg-emerald-50/5' : 'border-slate-200 bg-white'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className={`font-bold text-sm text-slate-900 ${task.status === 'done' ? 'line-through opacity-50' : ''}`}>{task.title}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${PRIORITY_STYLES[task.priority]}`}>{task.priority}</span>
                            {isOverdue && <span className="text-[9px] font-bold text-rose-700 bg-rose-100 border border-rose-200 px-1.5 py-0.2 rounded-full">OVERDUE</span>}
                            {isDueSoon && <span className="text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.2 rounded-full">DUE SOON</span>}
                          </div>
                          {task.description && <p className="text-xs text-slate-500 mb-1.5 line-clamp-1">{task.description}</p>}
                          <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1"><Calendar className="h-3 w-3 shrink-0" /> Due: {formatDateNY(task.dueDate)} · {task.team}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[task.status]}`}>{STATUS_LABELS[task.status]}</span>
                          <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-orange-500 transition-colors" />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Leaves History */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-900">Recent Leave Requests</h2>
            <Card className="overflow-hidden p-0 border border-slate-200 bg-white">
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[500px] text-xs text-left border-collapse">
                  <thead className="font-bold text-slate-600 bg-slate-50 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Duration</th>
                      <th className="px-5 py-3">Reason</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {leaves
                      .filter(l => 
                        l.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        l.reason.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map((leave) => (
                        <tr key={leave.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3.5 font-bold text-slate-900">{leave.type}</td>
                          <td className="px-5 py-3.5 text-slate-600 font-medium">{leave.duration}</td>
                          <td className="px-5 py-3.5 text-slate-500">{leave.reason}</td>
                          <td className="px-5 py-3.5">{getStatusBadge(leave.status)}</td>
                        </tr>
                      ))}
                    {leaves.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-400 font-semibold italic">No leave history found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {/* Mobile card stack */}
              <div className="md:hidden space-y-2 p-3">
                {leaves
                  .filter(l =>
                    l.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    l.reason.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((leave) => (
                    <div key={leave.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 shadow-sm">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-900">{leave.type}</p>
                        {getStatusBadge(leave.status)}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">Duration</p>
                          <p className="text-xs font-semibold text-slate-700">{leave.duration}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">Reason</p>
                          <p className="text-xs font-semibold text-slate-700">{leave.reason}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                {leaves.length === 0 && (
                  <p className="py-6 text-center text-slate-400 font-semibold italic text-xs">No leave history found.</p>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Right Column (4 cols): Announcements, Team, Referral — Shift
            Control moved to its own full-width card above the stats grid;
            see that section's comment for why. */}
        <div className="lg:col-span-4 space-y-6">

          {/* Announcements Feed Widget */}
          <Card className="border border-slate-200 bg-white">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Company Announcements</h3>
            </div>
            <CardContent className="p-4 space-y-3 max-h-64 overflow-y-auto">
              {myAnnouncements.map(ann => {
                const isUnread = !!userProfile?.email && !hrActions.isAnnouncementRead(ann, userProfile.email, announcementReadMap);
                return (
                  <div
                    key={ann.id}
                    className={`p-3 rounded-lg border text-xs transition-colors duration-200 ${
                      isUnread ? 'border-orange-200 bg-orange-50/60' : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1 gap-2">
                      <span className="font-bold text-slate-900 truncate flex items-center gap-1.5 min-w-0">
                        {isUnread && <span className="h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0 presence-dot" />}
                        <span className="truncate" title={ann.title}>{ann.title}</span>
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isUnread && (
                          <span className="text-[8px] font-black uppercase tracking-wider text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full">New</span>
                        )}
                        <span className="text-[9px] text-slate-400 font-medium">{ann.timestamp.split(' ')[0]}</span>
                      </div>
                    </div>
                    <p className="text-slate-600 leading-relaxed mt-1 font-medium whitespace-pre-wrap break-words">{ann.content}</p>
                  </div>
                );
              })}
              {myAnnouncements.length === 0 && (
                <p className="text-xs text-slate-400 font-semibold italic text-center py-2">No announcements for your region.</p>
              )}
            </CardContent>
          </Card>

          {/* Team Monitor (For Team Leads Only) — list rows now share a
              single divider line instead of each being its own nested
              bordered/tinted box inside the outer Card (nested cards read
              as "boxes within boxes" clutter, not real content grouping). */}
          {userProfile?.isTeamLead && (
            <Card className="bg-white">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 text-purple-500" /> Team Tracker Monitor
                </h3>
                <Badge variant="default">Lead</Badge>
              </div>
              <CardContent className="p-0">
                <p className="text-[10px] text-slate-500 leading-relaxed font-semibold px-4 pt-3.5 pb-1">Monitor the active workstation tracking logs of the members you lead:</p>
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {allEmployees
                    .filter(emp => emp.id !== userProfile.id && emp.teams && emp.teams.some(t => userProfile.leadTeams?.includes(t)))
                    .map(member => (
                      <div key={member.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs font-semibold">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar src={member.profilePicture} name={displayName(member, userProfile?.role)} size={24} />
                          <div className="truncate max-w-[110px]">
                            <div className="font-bold text-slate-800 truncate">{displayName(member, userProfile?.role)}</div>
                            <div className="text-[9px] text-slate-400 font-semibold truncate">{member.jobTitle || 'Staff'}</div>
                          </div>
                        </div>
                        {isTrackingLiveFor(member) ? (
                          <button
                            onClick={() => handleOpenReviewModal(member)}
                            className="text-[9px] font-bold text-slate-600 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg active:scale-97 transition-colors transition-transform flex items-center gap-1 shrink-0"
                          >
                            Review
                          </button>
                        ) : (
                          <span className="text-[9px] text-slate-400 italic shrink-0">No Tracking</span>
                        )}
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* My Team & Team Lead Widget */}
          <Card className="border border-slate-200 bg-white">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">My Team ({userProfile?.teams.join(', ')})</h3>
            </div>
            <CardContent className="p-0">
              {/* Team Lead — a single highlighted row, not a boxed card;
                  the tint alone is enough to set it apart from the plain
                  co-worker rows below. */}
              <div className="px-4 pt-4 pb-3 border-b border-slate-100">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Team Lead</p>
                {teamLead ? (
                  <div className="flex items-center gap-2.5 bg-purple-50/60 rounded-lg p-2 text-xs -mx-2">
                    <Avatar src={teamLead.profilePicture} name={displayName(teamLead, userProfile?.role)} size={24} />
                    <div>
                      <div className="font-bold text-slate-800 flex items-center gap-1"><Star className="h-3 w-3 text-purple-500 shrink-0" /> {displayName(teamLead, userProfile?.role)}</div>
                      <div className="text-[10px] text-slate-400 font-semibold">{teamLead.email}</div>
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 font-semibold italic">No lead assigned to this team.</span>
                )}
              </div>

              {/* Members — plain divided list, not a stack of mini-cards. */}
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-1">Co-Workers</p>
                <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
                  {teamMembers.map(member => (
                    <div key={member.id} className="flex items-center gap-2 px-4 py-2 text-xs">
                      <Avatar src={member.profilePicture} name={displayName(member, userProfile?.role)} size={20} />
                      <div className="truncate">
                        <div className="font-semibold text-slate-800 truncate">{displayName(member, userProfile?.role)}</div>
                        <div className="text-[9px] text-slate-400 truncate">{member.email}</div>
                      </div>
                    </div>
                  ))}
                  {teamMembers.length === 0 && (
                    <span className="text-xs text-slate-400 italic font-semibold px-4 pb-3 block">You are the only member in this team.</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Job Referral Widget */}
          <Card className="border border-slate-200 bg-white">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Candidate Referrals</h3>
            </div>
            <CardContent className="p-5 space-y-3.5 text-xs text-slate-600 leading-relaxed font-semibold">
              <p>Refer candidates to our open positions! If your referral gets hired and completes <strong>6 months</strong> of service, you will receive a bonus reward:</p>
              <div className="flex items-center justify-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl font-bold text-center text-sm">
                <Gift className="h-4 w-4 shrink-0" /> Referral Bonus: PKR 10,000
              </div>
              <button 
                onClick={() => router.push('/employee/careers')} 
                className="w-full bg-slate-50 border border-slate-200 text-slate-700 font-bold py-2.5 md:py-2 rounded-lg text-xs hover:bg-slate-100 transition-colors transition-transform active:scale-97 text-center"
              >
                View open positions to refer →
              </button>
            </CardContent>
          </Card>
        </div>

      </div>

      {/* Mobile-blocked prompt — shown when Start Shift is blocked because
          screen tracking is enabled for this employee and they're on the
          native mobile app, which has no desktop agent to run the tracker. */}
      {showMobileBlockedModal && (
        <Modal isOpen onClose={() => setShowMobileBlockedModal(false)} title="Desktop Required for This Shift">
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 p-4 rounded-xl">
              <Smartphone className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                Your account has screen tracking enabled by HR/Admin. Since the DelCargo Tracker app only runs on Windows/Mac, shifts for tracked accounts can&apos;t be started from the mobile app. Please start your shift from a desktop computer with the tracker app installed and running.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setShowMobileBlockedModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs transition-colors transition-transform active:scale-97"
              >
                Close
              </button>
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
                Your account has screen tracking enabled by HR/Admin, so your shift can only be started once the DelCargo Tracker desktop app is installed and running. Open the app (check your system tray / menu bar if it's already installed) and try starting your shift again.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => router.push('/employee/tracker')}
                className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-colors transition-transform active:scale-97"
              >
                Go to Tracker Setup
              </button>
              <button
                onClick={() => setShowTrackerRequiredModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs transition-colors transition-transform active:scale-97"
              >
                Close
              </button>
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
              <button
                onClick={() => router.push(shiftStopReason === 'inactivity_absence' ? '/employee/absences' : '/employee/tracker')}
                className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-colors transition-transform active:scale-97"
              >
                {shiftStopReason === 'inactivity_absence' ? 'View Absent Details' : 'Go to Tracker Setup'}
              </button>
              <button
                onClick={() => setShiftStopModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs transition-colors transition-transform active:scale-97"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <Modal isOpen onClose={() => setSelectedTask(null)} title="Task Details">
          <div className="space-y-4">
            <div className="flex gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${PRIORITY_STYLES[selectedTask.priority]}`}>
                {selectedTask.priority} priority
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[selectedTask.status]}`}>
                {STATUS_LABELS[selectedTask.status]}
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
              <button
                onClick={() => setSelectedTask(null)}
                disabled={isUpdatingTaskStatus}
                className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-4 py-2.5 md:py-2 rounded-lg text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Employee Activity & Timesheet Review Modal */}
      {selectedReviewEmp && (
        <Modal isOpen onClose={() => setSelectedReviewEmp(null)} title="Workstation Timesheet & Activity Review" className="md:max-w-3xl">
          <div className="space-y-6 pt-1 font-sans">
            <div className="flex justify-between items-start bg-slate-50 p-4 border border-slate-200 rounded-xl">
              <div>
                <p className="text-xs text-slate-500 font-semibold">Reviewing Employee</p>
                <p className="text-sm font-bold text-slate-900">{displayName(selectedReviewEmp, userProfile?.role)}</p>
                <p className="text-[10px] text-slate-500 font-bold">{selectedReviewEmp.email} · {selectedReviewEmp.jobTitle || 'Staff'}</p>
              </div>
              <Badge variant={selectedReviewEmp.region === 'USA' ? 'default' : 'success'}>
                {selectedReviewEmp.region === 'USA' ? 'USA Operations' : 'Pakistan Remote'}
              </Badge>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Real Shift History (Clock-In / Clock-Out)</h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="font-bold text-slate-500 bg-slate-50 border-b border-slate-200 uppercase tracking-widest text-[9px]">
                      <tr>
                        <th className="px-4 py-2.5">Date</th>
                        <th className="px-4 py-2.5">Clock In</th>
                        <th className="px-4 py-2.5">Clock Out</th>
                        <th className="px-4 py-2.5 text-right">Duration</th>
                        <th className="px-4 py-2.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {reviewEntries.map((entry, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-bold text-slate-700">{localShiftDate(entry.clockIn, entry.date)}</td>
                          <td className="px-4 py-3 text-slate-600 font-medium font-mono text-[10px]">{entry.clockIn ? formatTimeNY(entry.clockIn) : '—'}</td>
                          <td className="px-4 py-3 text-slate-600 font-medium font-mono text-[10px]">{entry.clockOut ? formatTimeNY(entry.clockOut) : '—'}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">{entry.duration || '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <Badge variant={entry.status === 'in_progress' ? 'warning' : 'success'}>
                              {entry.status === 'in_progress' ? 'On Shift' : 'Completed'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      {reviewEntries.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-400 font-semibold italic">No real shift history recorded yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {/* Mobile card stack */}
                <div className="md:hidden space-y-2 p-3">
                  {reviewEntries.map((entry, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 shadow-sm">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-900">{localShiftDate(entry.clockIn, entry.date)}</p>
                        <Badge variant={entry.status === 'in_progress' ? 'warning' : 'success'}>
                          {entry.status === 'in_progress' ? 'On Shift' : 'Completed'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">Clock In / Out</p>
                          <p className="text-xs font-semibold text-slate-700 font-mono">
                            {entry.clockIn ? formatTimeNY(entry.clockIn) : '—'}
                            {' → '}
                            {entry.clockOut ? formatTimeNY(entry.clockOut) : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">Duration</p>
                          <p className="text-xs font-bold text-slate-900">{entry.duration || '—'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {reviewEntries.length === 0 && (
                    <p className="py-6 text-center text-slate-400 font-semibold italic text-xs">No real shift history recorded yet.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Workspace Screenshots</h4>
              <div className="border border-slate-200 p-6 rounded-xl bg-slate-50/50 text-center space-y-2 font-sans">
                <Monitor className="h-6 w-6 text-slate-400 mx-auto" />
                <div>
                  <h5 className="text-xs font-bold text-slate-700">Desktop Capture Offline</h5>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-semibold mt-1">
                    This feature will be available soon (requires Windows client agent installation).
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-200">
              <button
                onClick={() => setSelectedReviewEmp(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-4 py-2 rounded-lg text-xs"
              >
                Close Logs
              </button>
            </div>
          </div>
        </Modal>
      )}
      {/* Early Shift End / Under 8 Hours Warning Modal */}
      {showUnder8HourModal && under8HourDetails && (
        <Modal isOpen={showUnder8HourModal} onClose={() => setShowUnder8HourModal(false)} title="Under 8 Hours Shift Warning">
          <div className="space-y-4 font-sans text-xs">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-sm">Mandatory 8-Hour Shift Requirement</p>
                <p className="text-amber-800 leading-relaxed font-medium">
                  Employees are required to complete at least <strong>8 hours</strong> of total shift time per day.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center text-slate-700">
                <span className="font-semibold text-slate-500">Today's Completed/Current Shift Time:</span>
                <span className="font-bold font-mono text-sm text-slate-900">
                  {Math.floor(under8HourDetails.workedMinutes / 60)}h {under8HourDetails.workedMinutes % 60}m
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-700 pt-2 border-t border-slate-200">
                <span className="font-semibold text-amber-700">Remaining Time Required Today:</span>
                <span className="font-bold font-mono text-sm text-amber-700">
                  {Math.floor(under8HourDetails.remainingMinutes / 60)}h {under8HourDetails.remainingMinutes % 60}m
                </span>
              </div>
            </div>

            <p className="text-slate-500 text-[11px] leading-relaxed">
              If your shift was split into multiple parts due to internet/app disconnections, your total worked time today is combined. If you still need to end your shift early, please confirm below.
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                onClick={() => setShowUnder8HourModal(false)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors"
              >
                Keep Shift Running
              </button>
              <button
                onClick={async () => {
                  setShowUnder8HourModal(false);
                  if (!userProfile?.email) return;
                  setShiftActive(false);
                  setGeofenceStatus('Shift Ended');
                  openShiftRef.current = null;
                  await hrActions.clockOut(userProfile.email);
                  await refetchTimesheets();
                  await hrActions.addNotification(userProfile.email, 'employee', `Shift ended before 8 hours completed (${Math.floor(under8HourDetails.workedMinutes / 60)}h ${under8HourDetails.workedMinutes % 60}m worked).`);
                  const shiftActorName = displayName(userProfile, 'hr');
                  await hrActions.addNotification('all', 'hr', `${shiftActorName} ended shift early (${Math.floor(under8HourDetails.workedMinutes / 60)}h ${under8HourDetails.workedMinutes % 60}m total today).`, 'shift', shiftActorName, userProfile.email);
                  await hrActions.addNotification('all', 'admin', `${shiftActorName} ended shift early (${Math.floor(under8HourDetails.workedMinutes / 60)}h ${under8HourDetails.workedMinutes % 60}m total today).`, 'shift', shiftActorName, userProfile.email);
                }}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-4 py-2 rounded-xl text-xs transition-colors"
              >
                Confirm End Shift Early
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
