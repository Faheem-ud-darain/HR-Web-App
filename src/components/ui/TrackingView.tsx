'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import {
  Profile,
  TrackingSettings,
  TrackerHeartbeat,
  TrackerDiagnostics,
  Screenshot,
  InactivityLog,
  TimesheetEntry,
  useProfiles,
  useTrackingSettings,
  useAllTrackerHeartbeats,
  useTimesheets,
  hrActions,
  displayName,
  updateProfileAdmin,
  getCaptureHealth,
} from '@/lib/hrData';
import { pushModal, popModal } from '@/lib/modalStack';
import { formatDateTimeNY, getNYDateString, getNYMidnight } from '@/lib/timezone';
import { encodeSetupCode, getPocketBaseConfig, POCKETBASE_URL, needsTrackerUpdate, TRACKER_MIN_VERSION } from '@/lib/trackerSetup';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Monitor, RefreshCw, ShieldAlert, Wifi, WifiOff, ZoomIn, ZoomOut, X, ChevronLeft, ChevronRight, RotateCcw, AlertTriangle, Lock, ImageOff } from 'lucide-react';
import { MouseActivityModal } from "@/components/ui/tracking/MouseActivityModal";
import { ScreenshotsModal } from "@/components/ui/tracking/ScreenshotsModal";
import { TrackerSetupModal } from "@/components/ui/tracking/TrackerSetupModal";
import { TrackerEmployeeList } from "@/components/ui/tracking/TrackerEmployeeList";
import { useIsClient } from '@/lib/useIsClient';

interface TrackingViewProps {
  role: 'admin' | 'hr' | 'team_lead';
  // Required when role === 'team_lead' — scopes the visible employee list
  // to that team lead's own teammates (see `employees` below) and is used
  // to look up their leadTeams. Ignored for admin/hr, who see everyone.
  viewerEmail?: string;
}

export const AGENT_SCRIPT_PATH = '/delcargo_tracker_agent.py';

// Local (viewer's own browser timezone) YYYY-MM-DD — NOT
// `new Date().toISOString().split('T')[0]`, which is the UTC calendar date.
// The Daily view's date input and computeWindow() below both treat this
// string as a *local* midnight-to-midnight day (`new Date(`${day}T00:00:00`)`
// has no "Z", so JS parses it in the browser's local timezone). Defaulting
// to the UTC date instead is a real mismatch for any viewer west of UTC —
// e.g. a US-based (UTC-5) admin opening this in the evening already has
// tomorrow's UTC date, so "Today" silently pointed at a day that hadn't
// happened yet and showed no data at all. This keeps the default/max always
// in sync with America/New_York (where shift days are measured).
export const localDateString = (d: Date = new Date()): string => getNYDateString(d);

export function TrackingView({ role, viewerEmail }: TrackingViewProps) {
  // Team Leads get read-only access to their own teammates' tracking data
  // (screenshots, mouse inactivity) — they can never see/change tracking
  // settings (enable/disable, interval, exclude-from-auto-delete) or the
  // Setup Agent flow, which stays HR/Admin-only.
  const canManage = role === 'admin' || role === 'hr';
  const [regionFilter, setRegionFilter] = useState<'All' | 'USA' | 'Pakistan'>('All');

  // Setup Agent modal
  const [setupEmp, setSetupEmp] = useState<Profile | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);

  // Remote diagnostics (Signal 6/7) — added 2026-08-24. 'idle' before the
  // first request; 'waiting' while polling for a Signal 7 response;
  // 'timeout' when a v18-or-earlier agent (or an offline one) never
  // answers within DIAGNOSTICS_TIMEOUT_MS — that state is deliberately
  // worded as "couldn't reach it" in the UI, not "broken", since a plain
  // timeout is also the expected result from any agent older than v19.
  const [diagnosticsStatus, setDiagnosticsStatus] = useState<'idle' | 'waiting' | 'ok' | 'timeout'>('idle');
  const [diagnosticsResult, setDiagnosticsResult] = useState<TrackerDiagnostics | null>(null);
  // Guards against a still-in-flight poll chain from a PREVIOUS request (a
  // different employee's modal, or a second click) writing its late result
  // into what's now a different request's state. Each handleRunDiagnostics
  // call claims a fresh id here; a poll only applies its result if its own
  // id is still the current one when it resolves.
  const diagnosticsRequestIdRef = useRef(0);

  // Screenshot viewer modal
  const [viewerEmp, setViewerEmp] = useState<Profile | null>(null);
  const [viewerRange, setViewerRange] = useState<'2days' | 'day' | 'week' | 'month'>('2days');
  // Which calendar day to show when viewerRange === 'day' — defaults to
  // today, but HR/Admin can pick any past day to see that shift's activity.
  const [viewerDay, setViewerDay] = useState<string>(() => localDateString());
  const [viewerShots, setViewerShots] = useState<Screenshot[]>([]);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Inactivity summary (loaded alongside screenshots for the same
  // employee/range — see loadViewerData below).
  const [viewerInactivity, setViewerInactivity] = useState<InactivityLog[]>([]);

  // Screenshot lightbox — full-size view with zoom, opened from a thumbnail.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);

  // This lightbox is a hand-rolled fixed overlay (not the shared Modal.tsx,
  // not a portal), so it needs to register with the same modal-stack tracker
  // used there — otherwise the mobile bottom pill nav has no way of knowing
  // to hide itself while it's open. See lib/modalStack.ts for why.
  const lightboxOpen = lightboxIndex !== null;
  useEffect(() => {
    if (lightboxOpen) {
      pushModal();
      return () => popModal();
    }
  }, [lightboxOpen]);

  // SSR/hydration-safe createPortal pattern (matches Modal.tsx) — this
  // lightbox is portaled straight to document.body (see below) instead of
  // rendered inline, so it can't get trapped inside any ancestor that
  // becomes an accidental containing block.
  const mounted = useIsClient();

  // Dedicated Mouse Activity modal — same Daily/Weekly/Monthly filter as the
  // screenshot viewer, but a full detail view of inactivity data on its own
  // (not just the compact summary embedded in the Screenshots modal).
  const [mouseEmp, setMouseEmp] = useState<Profile | null>(null);
  const [mouseRange, setMouseRange] = useState<'day' | 'week' | 'month'>('day');
  const [mouseDay, setMouseDay] = useState<string>(() => localDateString());
  const [mouseLogs, setMouseLogs] = useState<InactivityLog[]>([]);
  const [mouseLoading, setMouseLoading] = useState(false);

  const { data: allProfiles, isLoading: profilesLoading } = useProfiles();
  // Tracking settings live in the dedicated hr_tracking_settings collection
  // (one row per employee) — see useTrackingSettings in hrData.ts.
  const { data: settingsList = [], refetch: refetchSettings } = useTrackingSettings({ all: true });
  // Heartbeats are one KV row per device: tracker_heartbeat_<slug>. React
  // Query's own refetchInterval/staleness handles freshness here; no manual
  // refetch trigger is needed since this view doesn't mutate heartbeats.
  const { data: heartbeats = [], refetch: refetchHeartbeats } = useAllTrackerHeartbeats();
  // Needed to compute "Shift Time" / "Active Time" (shift minus inactivity)
  // in the Mouse Activity modal below, and (refetch) to find + force-close
  // an employee's currently open shift — see handleForceEndShift below.
  const { data: allTimesheets, refetch: refetchTimesheets } = useTimesheets();

  // Team Lead's own profile — used to resolve which teams they lead, so
  // their tracking view only ever shows their own teammates, never the
  // whole company.
  const viewerProfile = role === 'team_lead' ? (allProfiles || []).find(p => p.email.toLowerCase() === (viewerEmail || '').toLowerCase()) : null;

  const employees = (allProfiles || []).filter(e => {
    if (!(e.role === 'employee' || e.role === 'team_lead')) return false;
    if (role !== 'team_lead') return true;
    if (!viewerProfile) return false;
    if (e.email.toLowerCase() === (viewerEmail || '').toLowerCase()) return false; // teammates only, not self
    return e.teams?.some(t => viewerProfile.leadTeams?.includes(t));
  });
  useEffect(() => {
    // Monthly retention sweep — fire-and-forget, runs once per HR/Admin
    // dashboard visit. Safe to call repeatedly; it no-ops once this month
    // has already been checked (see checkScreenshotRetention in hrData.ts).
    hrActions.checkScreenshotRetention();
  }, []);

  const heartbeatFor = (email: string): TrackerHeartbeat | null =>
    heartbeats.find(h => h.employeeEmail?.toLowerCase() === email.toLowerCase()) || null;

  // Same "open shift" definition used everywhere else in this codebase
  // (clockOut empty/unset) — not a separate query, just a client-side
  // filter over the timesheets already loaded for the Mouse Activity modal.
  const openShiftFor = (email: string): TimesheetEntry | null =>
    (allTimesheets || []).find(t => !t.clockOut && t.clockIn && t.employeeEmail?.toLowerCase() === email.toLowerCase()) || null;

  // Force End Shift — added 2026-08-19, explicit request: HR/Admin needs a
  // way to make an employee whose desktop tracker is stuck on a stale/
  // regenerated setup code actually go through the new "Reconnect Required"
  // block instead of just quietly finishing out their current (untracked)
  // shift. Ends their open timesheet exactly the way their own "End Shift"
  // button would (hrActions.clockOut — writes clock_out, stops the tracker
  // via Signal 5, cleans up the tab heartbeat), so the next time they try to
  // start a shift they hit the same ping/pong → version → stale-token gate
  // sequence as any other Start Shift attempt.
  const [forceEndShiftEmp, setForceEndShiftEmp] = useState<Profile | null>(null);
  const [forceEndingShift, setForceEndingShift] = useState(false);

  const handleForceEndShift = async (emp: Profile) => {
    setForceEndingShift(true);
    try {
      await hrActions.clockOut(emp.email);
      await refetchTimesheets();
      await hrActions.addNotification(
        emp.email,
        'employee',
        'Your shift was ended by HR/Admin. Please reconnect your DelCargo Tracker (check the Tracker Setup page for a new setup code if prompted) before starting your next shift.'
      );
      setForceEndShiftEmp(null);
    } finally {
      setForceEndingShift(false);
    }
  };

  // Force Disconnect — added 2026-08-19, explicit follow-up request: "Force
  // End Shift" above only stops the CURRENT shift; if the employee's tracker
  // isn't actually stale, they could just hit Start Shift again immediately
  // and sail right through the 1j gate with nothing changed. This button
  // guarantees the block: it calls the EXISTING regenerateAgentToken()
  // (already used by "Regenerate Token" inside the Setup Agent modal — see
  // handleRegenerateToken above) directly from the row/card, without HR
  // having to open that modal first. Once the token is regenerated, the
  // employee's currently-installed tracker is instantly holding a setup
  // code that no longer matches any row in hr_tracking_settings — its next
  // settings poll (every 20s, see agent_gui.py) reports "Setup token not
  // recognized," hasStaleTrackerToken() flips true, and the very next Start
  // Shift attempt is blocked by the "Reconnect Tracker Required" modal until
  // they paste in the new code from the Tracker Setup page. This is how
  // HR/Admin makes reconnecting mandatory rather than optional.
  const [forceDisconnectEmp, setForceDisconnectEmp] = useState<Profile | null>(null);
  const [revokingSetupCode, setRevokingSetupCode] = useState(false);

  const handleForceDisconnectTracker = async (emp: Profile) => {
    setRevokingSetupCode(true);
    try {
      await hrActions.regenerateAgentToken(emp.email);
      await refetchSettings();
      await hrActions.addNotification(
        emp.email,
        'employee',
        'Your tracker setup code was reset by HR/Admin, so your desktop tracker can no longer connect. Open the Tracker Setup page, copy the new setup code, and paste it into the DelCargo Tracker app before you can start your next shift.'
      );
      setForceDisconnectEmp(null);
    } finally {
      setRevokingSetupCode(false);
    }
  };

  // Shown alongside the green "Connected" badge (only while the heartbeat is
  // live) to close the exploit where a tracker sits "Connected" for hours
  // while producing zero usable screenshots — see getCaptureHealth in
  // hrData.ts. Returns null for 'ok'/'idle'/'unknown' since those aren't
  // actionable warnings (idle = no active shift right now; unknown = agent
  // predates v14 and hasn't reported capture health at all yet).
  const CaptureHealthBadge = ({ hb }: { hb: TrackerHeartbeat | null }) => {
    const health = getCaptureHealth(hb);
    if (health.status === 'locked') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full" title={health.detail}>
          <Lock className="h-3 w-3" /> Screen Locked
        </span>
      );
    }
    if (health.status === 'failing') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded-full" title={health.detail}>
          <ImageOff className="h-3 w-3" /> No Screenshots
        </span>
      );
    }
    if (health.status === 'stale_token') {
      // The employee's setup code was regenerated (by HR/Admin or the
      // employee themselves) but this already-running desktop agent is
      // still authenticating with the OLD token, so it can no longer find
      // its own settings row — captureEnabled reports false but for a
      // completely different reason than "not on shift" (which is what
      // 'idle' — rendered as nothing at all — covers). Without this
      // distinct badge, this looked identical to a connected-but-idle
      // tracker, which is exactly how zara/alex silently went uncaptured
      // for over an hour despite tracking being genuinely enabled for them.
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-1 rounded-full" title={health.detail}>
          <RefreshCw className="h-3 w-3" /> Reconnect Required
        </span>
      );
    }
    return null;
  };

  // The "is this employee's desktop tracker actually connected right now"
  // badge — was hand-duplicated between the desktop table row and the
  // mobile card view below (same markup, only the outer alignment differed)
  // until this extraction. `align` picks the one difference between the two
  // call sites: the desktop table centers the stack, the mobile card right-
  // aligns it against the employee's name/email.
  const TrackerStatusBadge = ({ hb, settings, align }: { hb: TrackerHeartbeat | null; settings: TrackingSettings; align: 'center' | 'end' }) => {
    const isLive = hrActions.isHeartbeatLive(hb, settings.intervalMinutes);
    if (!isLive) {
      return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full ${align === 'end' ? 'shrink-0' : ''}`}>
          <WifiOff className="h-3 w-3" /> {hb ? 'Offline' : (settings.enabled ? 'Disconnected' : 'Not installed')}
        </span>
      );
    }
    return (
      <div className={`flex flex-col ${align === 'end' ? 'items-end shrink-0' : 'items-center'} gap-1`}>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full" title={hb?.deviceLabel || ''}>
          <Wifi className="h-3 w-3" /> Connected{hb?.agentVersion ? ` · v${hb.agentVersion}` : ''}
        </span>
        {needsTrackerUpdate(hb?.agentVersion, hb?.deviceLabel) && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full" title={`Must update to v${TRACKER_MIN_VERSION}`}>
            <AlertTriangle className="h-3 w-3" /> Update Required
          </span>
        )}
        <CaptureHealthBadge hb={hb} />
      </div>
    );
  };

  const settingsFor = (email: string): TrackingSettings =>
    settingsList.find(s => s.employeeEmail.toLowerCase() === email.toLowerCase())
    || { employeeEmail: email, enabled: false, intervalMinutes: 15, excludeFromAutoDelete: false, agentToken: '' };

  const handleToggle = async (email: string, enabled: boolean) => {
    await hrActions.updateTrackingSettings(email, { enabled });
    // Keep hr_profiles.tracking_enabled in sync with this toggle. That
    // separate flag is what Sidebar.tsx checks to decide whether to show
    // the employee's "Timesheet Tracker" nav link (and therefore whether
    // they ever see the agent download button / setup code on that page)
    // — without this, flipping tracking on here left employees unable to
    // find the download link at all, even though tracking was "on" behind
    // the scenes.
    const emp = employees.find(e => e.email.toLowerCase() === email.toLowerCase());
    if (emp) await updateProfileAdmin(emp.id, { trackingEnabled: enabled });
    refetchSettings();
  };

  const handleIntervalChange = async (email: string, minutes: number) => {
    // 1 minute is the enforced floor — matches the agent's own safety-net
    // clamp (see tracker-agent/agent_gui.py / public/delcargo_tracker_agent.py).
    if (!Number.isFinite(minutes) || minutes < 1) return;
    await hrActions.updateTrackingSettings(email, { intervalMinutes: minutes });
    refetchSettings();
  };

  const handleExcludeToggle = async (email: string, excludeFromAutoDelete: boolean) => {
    await hrActions.updateTrackingSettings(email, { excludeFromAutoDelete });
    refetchSettings();
  };

  const handleOpenSetup = async (emp: Profile) => {
    setCopied(false);
    setDiagnosticsStatus('idle');
    setDiagnosticsResult(null);
    const settings = settingsFor(emp.email);
    if (!settings.agentToken) {
      await hrActions.updateTrackingSettings(emp.email, {});
      await refetchSettings();
    }
    setSetupEmp(emp);
  };

  // Signal 6/7 round trip: clear any stale response first (so a leftover
  // answer from a previous request can't be mistaken for this one), issue
  // the command, then poll for up to DIAGNOSTICS_TIMEOUT_MS. A v18-or-older
  // agent never writes a response at all — that's the expected, common case
  // right now during the soft rollout, not an error — so the timeout state
  // is worded accordingly in the UI rather than as a failure.
  const DIAGNOSTICS_POLL_MS = 1000;
  const DIAGNOSTICS_TIMEOUT_MS = 10000;
  const handleRunDiagnostics = async (email: string) => {
    const requestId = ++diagnosticsRequestIdRef.current;
    setDiagnosticsStatus('waiting');
    setDiagnosticsResult(null);
    await hrActions.clearTrackerDiagnostics(email).catch(() => {});
    await hrActions.writeTrackerCommand(email, 'diagnostics');
    const startedAt = Date.now();
    const poll = async () => {
      if (diagnosticsRequestIdRef.current !== requestId) return; // superseded
      const result = await hrActions.getTrackerDiagnostics(email).catch(() => null);
      if (diagnosticsRequestIdRef.current !== requestId) return; // superseded while awaiting
      if (result) {
        setDiagnosticsResult(result);
        setDiagnosticsStatus('ok');
        return;
      }
      if (Date.now() - startedAt >= DIAGNOSTICS_TIMEOUT_MS) {
        setDiagnosticsStatus('timeout');
        return;
      }
      setTimeout(poll, DIAGNOSTICS_POLL_MS);
    };
    setTimeout(poll, DIAGNOSTICS_POLL_MS);
  };

  const handleReloadSettingsNow = async (email: string) => {
    await hrActions.writeTrackerCommand(email, 'reload_settings');
  };

  // Remote fix actions (v25+ trackers; older builds ignore them). Restart
  // relaunches the packaged app in a few seconds without ending the shift.
  const handleTrackerAction = async (email: string, type: 'reconnect' | 'restart') => {
    await hrActions.writeTrackerCommand(email, type);
  };

  const [pendingRegenerateTokenEmail, setPendingRegenerateTokenEmail] = useState<string | null>(null);
  const [regeneratingToken, setRegeneratingToken] = useState(false);
  const [pendingForceDisconnectEmail, setPendingForceDisconnectEmail] = useState<string | null>(null);
  const [forceDisconnectingTracker, setForceDisconnectingTracker] = useState(false);

  const handleRegenerateToken = (email: string) => {
    setPendingRegenerateTokenEmail(email);
  };

  const confirmRegenerateToken = async () => {
    if (!pendingRegenerateTokenEmail) return;
    const email = pendingRegenerateTokenEmail;
    setPendingRegenerateTokenEmail(null);
    setRegeneratingToken(true);
    try {
      await hrActions.regenerateAgentToken(email);
      refetchSettings();
    } finally {
      setRegeneratingToken(false);
    }
  };

  // HR/Admin-facing escape hatch for the same "another device is active"
  // stuck-superseded state employees can hit themselves from the Tracker
  // page — useful when an employee reports being blocked and can't wait for
  // a stale heartbeat to expire on its own. Does not change the agent
  // token (unlike Regenerate Token above), so a reconnect works immediately
  // with the same setup code once the new device's tracker is opened again.
  const handleForceDisconnect = (email: string) => {
    setPendingForceDisconnectEmail(email);
  };

  const confirmForceDisconnect = async () => {
    if (!pendingForceDisconnectEmail) return;
    const email = pendingForceDisconnectEmail;
    setPendingForceDisconnectEmail(null);
    setForceDisconnectingTracker(true);
    try {
      await hrActions.forceDisconnectAllTrackers(email);
      refetchHeartbeats();
    } finally {
      setForceDisconnectingTracker(false);
    }
  };

  const copyConfig = (settings: TrackingSettings) => {
    const config = `POCKETBASE_URL=${POCKETBASE_URL}\nAGENT_TOKEN=${settings.agentToken}`;
    navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copySetupCode = (settings: TrackingSettings) => {
    const { url } = getPocketBaseConfig();
    const code = encodeSetupCode(url, settings.agentToken);
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Builds a plain-text version of a live diagnostics result — same data
  // the panel below already renders, just formatted as labeled lines
  // instead of a grid, so it reads cleanly wherever it's pasted: a ticket,
  // a Slack message, or straight into an AI chat for help troubleshooting.
  // Deliberately plain text (no markdown/HTML) since the destination is
  // unknown and plain text pastes cleanly everywhere.
  const formatDiagnosticsReport = (emp: Profile, diag: TrackerDiagnostics): string => {
    const line = (label: string, value: string) => `${label}: ${value}`;
    const lines = [
      'DelCargo Tracker Diagnostics Report',
      line('Employee', `${displayName(emp, role)} <${diag.employeeEmail}>`),
      line('Device', `${diag.deviceLabel || 'Unknown device'} — ${diag.platform} — Tracker v${diag.appVersion}`),
      line('Responded at', `${formatDateTimeNY(diag.respondedAt)} (${diag.respondedAt})`),
      '',
      line('Connection', diag.connectionStatus || (diag.connected ? 'connected' : 'disconnected')),
      line('Tracking (HR toggle)', diag.enabledByHr ? 'enabled' : 'disabled'),
      line('Shift active', diag.shiftActive ? 'yes' : 'no'),
      line('Currently capturing', diag.enabled ? 'yes' : 'no'),
      line('Screen locked', diag.isLocked ? 'yes' : 'no'),
      line('Capture interval', `${diag.intervalMinutes ?? '—'} min`),
      line('Consecutive capture failures', String(diag.consecutiveCaptureFailures ?? 0)),
      line('Last capture', diag.lastCaptureAt ? `${formatDateTimeNY(diag.lastCaptureAt)} (${diag.lastCaptureAt})` : 'never'),
      line('Last error', diag.lastError || 'none'),
      line('Update available', diag.updateAvailableVersion ? `v${diag.updateAvailableVersion}` : 'no'),
      ...(diag.logTail ? ['', 'Recent tracker log:', diag.logTail.trimEnd()] : []),
    ];
    return lines.join('\n');
  };

  const copyDiagnosticsReport = (emp: Profile, diag: TrackerDiagnostics) => {
    navigator.clipboard.writeText(formatDiagnosticsReport(emp, diag));
    setCopiedDiagnostics(true);
    setTimeout(() => setCopiedDiagnostics(false), 2000);
  };

  const handleOpenViewer = async (emp: Profile) => {
    setViewerEmp(emp);
    setViewerRange('2days');
    const today = localDateString();
    setViewerDay(today);
    await loadViewerData(emp.email, '2days', today);
  };

  // Computes the [since, until) window for the current range/day selection.
  // '2days' loads the last 2 days of activity by default (saves bandwidth & prevents server strain),
  // 'day' is a single calendar day, 'week'/'month' are 7-day and 30-day extended windows.
  const computeWindow = (range: '2days' | 'day' | 'week' | 'month', day: string): { since: Date; until: Date } => {
    if (range === 'day') {
      const since = getNYMidnight(day);
      const until = new Date(since.getTime() + 24 * 60 * 60 * 1000);
      return { since, until };
    }
    if (range === '2days') {
      const midnightToday = getNYMidnight(day);
      const until = new Date(midnightToday.getTime() + 24 * 60 * 60 * 1000);
      const since = new Date(until.getTime() - 2 * 24 * 60 * 60 * 1000);
      return { since, until };
    }
    const now = new Date();
    const since = new Date(now);
    if (range === 'week') since.setDate(now.getDate() - 7);
    else since.setMonth(now.getMonth() - 1);
    return { since, until: now };
  };

  const loadViewerData = async (email: string, range: '2days' | 'day' | 'week' | 'month', day: string) => {
    setViewerLoading(true);
    try {
      const { since, until } = computeWindow(range, day);
      const [shots, inactivity] = await Promise.all([
        hrActions.getScreenshots({ employeeEmail: email, sinceISO: since.toISOString(), untilISO: until.toISOString() }),
        hrActions.getInactivityLogs({ employeeEmail: email, sinceISO: since.toISOString(), untilISO: until.toISOString() }),
      ]);
      setViewerShots(shots);
      setViewerInactivity(inactivity);
    } finally {
      setViewerLoading(false);
    }
  };

  const handleRangeChange = (range: '2days' | 'day' | 'week' | 'month') => {
    setViewerRange(range);
    if (viewerEmp) loadViewerData(viewerEmp.email, range, viewerDay);
  };

  const handleDayChange = (day: string) => {
    setViewerDay(day);
    if (viewerEmp) loadViewerData(viewerEmp.email, 'day', day);
  };

  const totalInactiveSeconds = viewerInactivity.reduce((sum, l) => sum + l.durationSeconds, 0);

  const formatDuration = (seconds: number): string => {
    // Round to whole minutes FIRST, then split into hours/minutes — rounding
    // each part independently (previous version) could carry a rounded-up
    // minutes remainder past 60 (e.g. 3599s showed as "0h 60m" instead of
    // "1h 0m").
    const totalMinutes = Math.round(seconds / 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  // ── Dedicated Mouse Activity modal ───────────────────────────────────────
  const handleOpenMouseView = async (emp: Profile) => {
    setMouseEmp(emp);
    setMouseRange('day');
    const today = localDateString();
    setMouseDay(today);
    await loadMouseData(emp.email, 'day', today);
  };

  const loadMouseData = async (email: string, range: 'day' | 'week' | 'month', day: string) => {
    setMouseLoading(true);
    try {
      const { since, until } = computeWindow(range, day);
      const logs = await hrActions.getInactivityLogs({ employeeEmail: email, sinceISO: since.toISOString(), untilISO: until.toISOString() });
      setMouseLogs(logs);
    } finally {
      setMouseLoading(false);
    }
  };

  const handleMouseRangeChange = (range: 'day' | 'week' | 'month') => {
    setMouseRange(range);
    if (mouseEmp) loadMouseData(mouseEmp.email, range, mouseDay);
  };

  const handleMouseDayChange = (day: string) => {
    setMouseDay(day);
    if (mouseEmp) loadMouseData(mouseEmp.email, 'day', day);
  };

  const mouseTotalSeconds = mouseLogs.reduce((sum, l) => sum + l.durationSeconds, 0);
  const mouseLongestSeconds = mouseLogs.reduce((max, l) => Math.max(max, l.durationSeconds), 0);
  const mouseAvgSeconds = mouseLogs.length > 0 ? Math.round(mouseTotalSeconds / mouseLogs.length) : 0;

  // Total clocked-in shift time for one employee that overlaps a given
  // [since, until) window — sums the overlap of each timesheet entry rather
  // than a simple date-field filter, so a shift that starts before/ends
  // after the window boundary (e.g. spans midnight) is only counted for the
  // portion actually inside the window. An open (still clocked-in) shift
  // counts up to "now".
  const getShiftSecondsInRange = (timesheets: TimesheetEntry[], email: string, since: Date, until: Date): number => {
    const now = new Date();
    return timesheets
      .filter(t => t.employeeEmail.toLowerCase() === email.toLowerCase())
      .reduce((sum, t) => {
        const start = new Date(t.clockIn);
        const end = t.clockOut ? new Date(t.clockOut) : now;
        const overlapStart = start > since ? start : since;
        const overlapEnd = end < until ? end : until;
        const seconds = (overlapEnd.getTime() - overlapStart.getTime()) / 1000;
        return sum + (seconds > 0 ? seconds : 0);
      }, 0);
  };

  const mouseWindow = mouseEmp ? computeWindow(mouseRange, mouseDay) : null;
  const mouseShiftSeconds = mouseEmp && mouseWindow
    ? getShiftSecondsInRange(allTimesheets || [], mouseEmp.email, mouseWindow.since, mouseWindow.until)
    : 0;
  // Active time = time actually clocked in minus the mouse-inactive stretches
  // within it. Floored at 0 in case inactivity data ever exceeds recorded
  // shift time (e.g. a shift edited/approved after capture).
  const mouseActiveSeconds = Math.max(0, mouseShiftSeconds - mouseTotalSeconds);

  // Groups logs by calendar day (local time) so Weekly/Monthly views can
  // still answer "when" clearly, not just a flat list — each day shows its
  // own subtotal plus every interval within it.
  const mouseLogsByDay = (): { day: string; logs: InactivityLog[]; totalSeconds: number }[] => {
    const groups: Record<string, InactivityLog[]> = {};
    mouseLogs.forEach(log => {
      const key = new Date(log.startAt).toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'short', day: 'numeric' });
      (groups[key] = groups[key] || []).push(log);
    });
    return Object.entries(groups)
      .map(([day, logs]) => ({
        // mouseLogs arrives newest-first (PocketBase sort=-start_at); sort
        // each day's own entries back into chronological (earliest-first)
        // order so the "Start/End" breakdown table below reads top-to-bottom
        // like an actual timeline instead of newest-first.
        day,
        logs: [...logs].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
        totalSeconds: logs.reduce((s, l) => s + l.durationSeconds, 0),
      }))
      .sort((a, b) => new Date(b.logs[b.logs.length - 1].startAt).getTime() - new Date(a.logs[a.logs.length - 1].startAt).getTime());
  };

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setZoom(1);
  };
  const closeLightbox = () => setLightboxIndex(null);
  const zoomIn = () => setZoom(z => Math.min(4, Math.round((z + 0.5) * 10) / 10));
  const zoomOut = () => setZoom(z => Math.max(1, Math.round((z - 0.5) * 10) / 10));
  const lightboxNav = (delta: number) => {
    if (lightboxIndex === null) return;
    const next = lightboxIndex + delta;
    if (next < 0 || next >= viewerShots.length) return;
    setLightboxIndex(next);
    setZoom(1);
  };

  // Keyboard controls for the screenshot lightbox — Escape closes, arrow
  // keys move between screenshots. Only attached while the lightbox is open.
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') lightboxNav(-1);
      else if (e.key === 'ArrowRight') lightboxNav(1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex, viewerShots.length]);


  const handleExportZip = async () => {
    if (!viewerEmp || viewerShots.length === 0) return;
    setExporting(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const manifestRows = ['Timestamp,Filename'];
      // imageUrl is either a data: URL (legacy captures) or a real
      // PocketBase file URL (current captures) — fetch() handles both
      // uniformly, so we no longer need to special-case base64 extraction.
      await Promise.all(viewerShots.map(async (s, i) => {
        const ts = new Date(s.timestamp);
        const res = await fetch(s.imageUrl);
        const blob = await res.blob();
        // Extension follows the actual file type — current captures are
        // WebP (see agent_gui.py), legacy pre-migration captures are JPEG.
        const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
        const filename = `${ts.toISOString().replace(/[:.]/g, '-')}_${i}.${ext}`;
        zip.file(filename, blob);
        manifestRows.push(`${s.timestamp},${filename}`);
      }));
      zip.file('manifest.csv', manifestRows.join('\n'));
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${viewerEmp.fullName.replace(/\s+/g, '_')}_screenshots_${viewerRange}_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. See console for details.');
    } finally {
      setExporting(false);
    }
  };

  const filteredEmployees = employees.filter(emp => regionFilter === 'All' || (emp.region || 'Pakistan') === regionFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Monitor className="h-5 w-5 md:h-6 md:w-6 text-orange-600" /> {canManage ? 'Employee Screen Tracking' : 'My Team — Screen Tracking'}
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            {canManage
              ? 'Enable desktop screenshot monitoring per employee, set capture intervals, and manage the monthly retention policy.'
              : "View screenshots and mouse-activity for your team — tracking settings (on/off, interval, retention) are managed by HR/Admin only."}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start">
          {(['All', 'USA', 'Pakistan'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRegionFilter(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors transition-shadow ${regionFilter === r ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <Card className="border border-amber-200 bg-amber-50/60">
        <CardContent className="p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <details className="text-xs text-amber-800 font-semibold leading-relaxed w-full [&_summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer font-bold flex justify-between items-center outline-none">
              <span className="truncate pr-2">About Tracker</span>
              <span className="text-[10px] bg-amber-200/50 px-2 py-1 rounded text-amber-900 shrink-0 whitespace-nowrap">Read More</span>
            </summary>
            <div className="mt-2 space-y-2 text-amber-800/90 font-medium">
              <p>
                Requires the DelCargo Tracker desktop app (Windows/Mac). It runs quietly in the background and only captures while tracking is Active and the employee is clocked in.
              </p>
              <p className="hidden sm:block">
                Employees can get their own setup code directly from their Shift Tracker page.
                Each code securely connects only to their own account.
              </p>
              <p className="hidden sm:block">
                Screenshots older than 30 days are automatically deleted each month,
                unless an employee is explicitly excluded below.
              </p>
            </div>
          </details>
        </CardContent>
      </Card>

      <TrackerEmployeeList canManage={canManage} profilesLoading={profilesLoading} filteredEmployees={filteredEmployees} settingsFor={settingsFor} heartbeatFor={heartbeatFor} role={role} TrackerStatusBadge={TrackerStatusBadge} handleToggle={handleToggle} handleIntervalChange={handleIntervalChange} handleExcludeToggle={handleExcludeToggle} handleOpenSetup={handleOpenSetup} handleOpenViewer={handleOpenViewer} handleOpenMouseView={handleOpenMouseView} openShiftFor={openShiftFor} setForceEndShiftEmp={setForceEndShiftEmp} setForceDisconnectEmp={setForceDisconnectEmp} />

      {/* Force End Shift confirmation — see handleForceEndShift above. */}
      {forceEndShiftEmp && (
        <Modal isOpen onClose={() => setForceEndShiftEmp(null)} title="Force End Shift">
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 p-4 rounded-xl">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                This will immediately end {displayName(forceEndShiftEmp, role)}&apos;s current shift, the same as if they clicked &quot;End Shift&quot; themselves. Their desktop tracker will be told to stop capturing right away. The next time they try to start a shift, the portal will run the same tracker connection check as always — if their tracker is still on an old/regenerated setup code, they&apos;ll see the &quot;Reconnect Tracker Required&quot; block until they reconnect it.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button
                variant="danger"
                size="md"
                onClick={() => handleForceEndShift(forceEndShiftEmp)}
                disabled={forceEndingShift}
              >
                {forceEndingShift ? 'Ending Shift…' : 'Force End Shift'}
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setForceEndShiftEmp(null)}
                disabled={forceEndingShift}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Force Disconnect confirmation — see handleForceDisconnectTracker
          above. This is what actually GUARANTEES the "Reconnect Required"
          block on their next Start Shift attempt, unlike Force End Shift
          alone (which does nothing if their tracker wasn't already stale). */}
      {forceDisconnectEmp && (
        <Modal isOpen onClose={() => setForceDisconnectEmp(null)} title="Force Disconnect Tracker">
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 p-4 rounded-xl">
              <ShieldAlert className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                This immediately invalidates {displayName(forceDisconnectEmp, role)}&apos;s current tracker setup code. Their currently-installed desktop tracker will stop being recognized within about 20 seconds and show &quot;Setup token not recognized&quot; on their side. Their next Start Shift attempt will be blocked with the &quot;Reconnect Tracker Required&quot; screen until they open Tracker Setup, copy the new code, and paste it into the app — there is no way around it.
              </p>
            </div>
            {openShiftFor(forceDisconnectEmp.email) && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 p-4 rounded-xl">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                  {displayName(forceDisconnectEmp, role)} is currently on an open shift. This alone won&apos;t end it — their tracker will simply stop capturing mid-shift. Use Force End Shift as well if you want them clocked out right now.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button
                variant="primary"
                size="md"
                onClick={() => handleForceDisconnectTracker(forceDisconnectEmp)}
                disabled={revokingSetupCode}
              >
                {revokingSetupCode ? 'Disconnecting…' : 'Force Disconnect'}
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setForceDisconnectEmp(null)}
                disabled={revokingSetupCode}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Setup Agent Modal */}
      <TrackerSetupModal setupEmp={setupEmp} diagnosticsRequestIdRef={diagnosticsRequestIdRef} setSetupEmp={setSetupEmp} role={role} settingsFor={settingsFor} copySetupCode={copySetupCode} copied={copied} handleRegenerateToken={handleRegenerateToken} handleForceDisconnect={handleForceDisconnect} copyConfig={copyConfig} handleRunDiagnostics={handleRunDiagnostics} diagnosticsStatus={diagnosticsStatus} handleReloadSettingsNow={handleReloadSettingsNow} handleTrackerAction={handleTrackerAction} diagnosticsResult={diagnosticsResult} copyDiagnosticsReport={copyDiagnosticsReport} copiedDiagnostics={copiedDiagnostics} />

      {/* Screenshot Viewer Modal */}
      <ScreenshotsModal viewerEmp={viewerEmp} setViewerEmp={setViewerEmp} role={role} handleRangeChange={handleRangeChange} viewerRange={viewerRange} viewerDay={viewerDay} handleDayChange={handleDayChange} handleExportZip={handleExportZip} viewerShots={viewerShots} exporting={exporting} viewerLoading={viewerLoading} viewerInactivity={viewerInactivity} formatDuration={formatDuration} totalInactiveSeconds={totalInactiveSeconds} openLightbox={openLightbox} />

      {/* Mouse Activity Modal — dedicated detail view of inactivity data,
          separate from the Screenshots modal's compact summary. */}
      <MouseActivityModal mouseEmp={mouseEmp} setMouseEmp={setMouseEmp} role={role} handleMouseRangeChange={handleMouseRangeChange} mouseRange={mouseRange} mouseDay={mouseDay} handleMouseDayChange={handleMouseDayChange} mouseLoading={mouseLoading} mouseShiftSeconds={mouseShiftSeconds} formatDuration={formatDuration} mouseTotalSeconds={mouseTotalSeconds} mouseActiveSeconds={mouseActiveSeconds} mouseLogs={mouseLogs} mouseLongestSeconds={mouseLongestSeconds} mouseAvgSeconds={mouseAvgSeconds} mouseLogsByDay={mouseLogsByDay} />

      {/* Screenshot Lightbox — opened by clicking a thumbnail above. A
          separate fixed overlay (not the shared Modal component) since it
          needs to render on top of the Screenshot Viewer modal itself and
          have its own zoom controls. */}
      {mounted && lightboxIndex !== null && viewerShots[lightboxIndex] && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-slate-950/90 flex flex-col"
          onClick={closeLightbox}
        >
          {/* Header controls — bumped to a darker, blurred pill (matching the
              nav chevrons below) so they stay legible over any content,
              consistent with the "visible over any image" fix throughout
              this lightbox. */}
          <div className="flex items-center justify-between px-4 py-3 text-white" onClick={e => e.stopPropagation()}>
            <span className="text-xs font-semibold text-slate-200">
              {formatDateTimeNY(viewerShots[lightboxIndex].timestamp)} · {lightboxIndex + 1} / {viewerShots.length}
            </span>
            <div className="flex items-center gap-1.5">
              <button onClick={zoomOut} disabled={zoom <= 1} className="p-2 rounded-lg bg-black/40 backdrop-blur-md hover:bg-black/55 disabled:opacity-40 transition-colors">
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-[10px] font-bold w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={zoomIn} disabled={zoom >= 4} className="p-2 rounded-lg bg-black/40 backdrop-blur-md hover:bg-black/55 disabled:opacity-40 transition-colors">
                <ZoomIn className="h-4 w-4" />
              </button>
              <button onClick={() => setZoom(1)} className="p-2 rounded-lg bg-black/40 backdrop-blur-md hover:bg-black/55 transition-colors" title="Reset zoom">
                <RotateCcw className="h-4 w-4" />
              </button>
              <button onClick={closeLightbox} className="p-2 rounded-lg bg-black/40 backdrop-blur-md hover:bg-black/55 transition-colors ml-1">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center overflow-auto relative" onClick={e => e.stopPropagation()}>
            {/* z-10 on both nav buttons — previously the "previous" button
                was written before the <img> in markup and "next" after it;
                with neither having an explicit z-index, default stacking
                order rendered the image on top of "previous" (making it
                invisible/unclickable) but left "next" on top of the image.
                Explicit z-10 here (on both, for correctness regardless of
                markup order) plus a darker blurred pill background (instead
                of the too-transparent bg-white/10) keeps both buttons
                visible and tappable over any screenshot, including
                white/light-background ones. */}
            {lightboxIndex > 0 && (
              <button
                onClick={() => lightboxNav(-1)}
                className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/40 backdrop-blur-md hover:bg-black/55 text-white transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <img
              src={viewerShots[lightboxIndex].imageUrl}
              alt="Screenshot full view"
              style={{ transform: `scale(${zoom})`, transition: 'transform 0.15s ease-out' }}
              className="max-h-[80vh] max-w-[90vw] object-contain select-none"
              onWheel={e => { e.preventDefault(); if (e.deltaY < 0) zoomIn(); else zoomOut(); }}
            />
            {lightboxIndex < viewerShots.length - 1 && (
              <button
                onClick={() => lightboxNav(1)}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/40 backdrop-blur-md hover:bg-black/55 text-white transition-colors"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      <ConfirmDialog
        isOpen={pendingRegenerateTokenEmail !== null}
        onClose={() => setPendingRegenerateTokenEmail(null)}
        onConfirm={confirmRegenerateToken}
        title="Regenerate token?"
        message="Regenerating the token will disconnect the currently installed agent until it is reconfigured with the new token. Continue?"
        confirmLabel={regeneratingToken ? 'Regenerating…' : 'Regenerate'}
        variant="warning"
        loading={regeneratingToken}
      />

      <ConfirmDialog
        isOpen={pendingForceDisconnectEmail !== null}
        onClose={() => setPendingForceDisconnectEmail(null)}
        onConfirm={confirmForceDisconnect}
        title="Force-disconnect tracker?"
        message={`Force-disconnect every tracker (desktop app or Chrome extension) currently linked to ${pendingForceDisconnectEmail}'s account, including one that may genuinely still be running? Use this only to unblock a stuck "device already connected" report.`}
        confirmLabel={forceDisconnectingTracker ? 'Disconnecting…' : 'Disconnect'}
        variant="warning"
        loading={forceDisconnectingTracker}
      />
    </div>
  );
}
