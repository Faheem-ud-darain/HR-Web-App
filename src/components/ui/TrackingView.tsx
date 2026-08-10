'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import {
  Profile,
  TrackingSettings,
  TrackerHeartbeat,
  Screenshot,
  InactivityLog,
  TimesheetEntry,
  useProfiles,
  useKVByPrefix,
  useTimesheets,
  hrActions,
  displayName,
} from '@/lib/hrData';
import { pushModal, popModal } from '@/lib/modalStack';
import { formatTimeNY, formatShortDateNY, formatDateTimeNY, getNYDateString, getNYMidnight } from '@/lib/timezone';
import { encodeSetupCode, getPocketBaseConfig, TRACKER_DOWNLOAD_WINDOWS_URL, TRACKER_DOWNLOAD_MAC_URL, TRACKER_DOWNLOAD_CHROMEOS_URL, POCKETBASE_URL, needsTrackerUpdate, TRACKER_MIN_VERSION } from '@/lib/trackerSetup';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { Monitor, Settings, Image as ImageIcon, Download, Copy, RefreshCw, ShieldAlert, Wifi, WifiOff, MousePointerClick, ZoomIn, ZoomOut, X, ChevronLeft, ChevronRight, RotateCcw, AlertTriangle } from 'lucide-react';

interface TrackingViewProps {
  role: 'admin' | 'hr' | 'team_lead';
  // Required when role === 'team_lead' — scopes the visible employee list
  // to that team lead's own teammates (see `employees` below) and is used
  // to look up their leadTeams. Ignored for admin/hr, who see everyone.
  viewerEmail?: string;
}

const AGENT_SCRIPT_PATH = '/delcargo_tracker_agent.py';

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
const localDateString = (d: Date = new Date()): string => getNYDateString(d);

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

  // Screenshot viewer modal
  const [viewerEmp, setViewerEmp] = useState<Profile | null>(null);
  const [viewerRange, setViewerRange] = useState<'day' | 'week' | 'month'>('day');
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Dedicated Mouse Activity modal — same Daily/Weekly/Monthly filter as the
  // screenshot viewer, but a full detail view of inactivity data on its own
  // (not just the compact summary embedded in the Screenshots modal).
  const [mouseEmp, setMouseEmp] = useState<Profile | null>(null);
  const [mouseRange, setMouseRange] = useState<'day' | 'week' | 'month'>('day');
  const [mouseDay, setMouseDay] = useState<string>(() => localDateString());
  const [mouseLogs, setMouseLogs] = useState<InactivityLog[]>([]);
  const [mouseLoading, setMouseLoading] = useState(false);

  const { data: allProfiles } = useProfiles();
  // Tracking settings live in a single hr_delcargo_store KV row (key
  // hr_tracking_settings_prod_v1); useKVByPrefix's "~" filter matches it.
  const { data: settingsRows, refetch: refetchSettings } = useKVByPrefix('hr_tracking_settings_prod_v1');
  // Heartbeats are one KV row per device: tracker_heartbeat_<slug>. React
  // Query's own refetchInterval/staleness handles freshness here; no manual
  // refetch trigger is needed since this view doesn't mutate heartbeats.
  const { data: heartbeatRows } = useKVByPrefix('tracker_heartbeat_');
  // Needed to compute "Shift Time" / "Active Time" (shift minus inactivity)
  // in the Mouse Activity modal below.
  const { data: allTimesheets } = useTimesheets();

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
  const settingsList = ((settingsRows || []).find(r => r.key === 'hr_tracking_settings_prod_v1')?.value as TrackingSettings[]) || [];
  const heartbeats = (heartbeatRows || []).map(r => r.value as TrackerHeartbeat);

  useEffect(() => {
    // Monthly retention sweep — fire-and-forget, runs once per HR/Admin
    // dashboard visit. Safe to call repeatedly; it no-ops once this month
    // has already been checked (see checkScreenshotRetention in hrData.ts).
    hrActions.checkScreenshotRetention();
  }, []);

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

  const heartbeatFor = (email: string): TrackerHeartbeat | null =>
    heartbeats.find(h => h.employeeEmail?.toLowerCase() === email.toLowerCase()) || null;

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
    if (emp) await hrActions.updateProfileDetails(emp.id, { trackingEnabled: enabled });
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
    const settings = settingsFor(emp.email);
    if (!settings.agentToken) {
      await hrActions.updateTrackingSettings(emp.email, {});
      await refetchSettings();
    }
    setSetupEmp(emp);
  };

  const handleRegenerateToken = async (email: string) => {
    const confirmed = window.confirm('Regenerating the token will disconnect the currently installed agent until it is reconfigured with the new token. Continue?');
    if (!confirmed) return;
    await hrActions.regenerateAgentToken(email);
    refetchSettings();
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

  const handleOpenViewer = async (emp: Profile) => {
    setViewerEmp(emp);
    setViewerRange('day');
    const today = localDateString();
    setViewerDay(today);
    await loadViewerData(emp.email, 'day', today);
  };

  // Computes the [since, until) window for the current range/day selection.
  // 'day' is a single calendar day in America/New_York time (matches a single
  // shift window), 'week'/'month' are the existing rolling windows.
  const computeWindow = (range: 'day' | 'week' | 'month', day: string): { since: Date; until: Date } => {
    if (range === 'day') {
      const since = getNYMidnight(day);
      const until = new Date(since.getTime() + 24 * 60 * 60 * 1000);
      return { since, until };
    }
    const now = new Date();
    const since = new Date(now);
    if (range === 'week') since.setDate(now.getDate() - 7);
    else since.setMonth(now.getMonth() - 1);
    return { since, until: now };
  };

  const loadViewerData = async (email: string, range: 'day' | 'week' | 'month', day: string) => {
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

  const handleRangeChange = (range: 'day' | 'week' | 'month') => {
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

      <Card className="overflow-hidden p-0 border border-slate-200">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm text-left border-collapse">
            <thead className="text-xs font-bold text-slate-500 bg-slate-50 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Employee</th>
                <th className="px-6 py-4">Region</th>
                <th className="px-6 py-4 text-center">Device</th>
                <th className="px-6 py-4 text-center">Tracking</th>
                {canManage && <th className="px-6 py-4 text-center">Interval (min)</th>}
                {canManage && <th className="px-6 py-4 text-center">Exclude from Auto-Delete</th>}
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredEmployees.map(emp => {
                const settings = settingsFor(emp.email);
                const hb = heartbeatFor(emp.email);
                const isLive = hrActions.isHeartbeatLive(hb, settings.intervalMinutes);
                return (
                  <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{displayName(emp, role)}</div>
                      <div className="text-xs text-slate-400">{emp.email}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-semibold">{emp.region || 'Pakistan'}</td>
                    <td className="px-6 py-4 text-center">
                      {isLive ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full" title={hb?.deviceLabel || ''}>
                            <Wifi className="h-3 w-3" /> Connected{hb?.agentVersion ? ` · v${hb.agentVersion}` : ''}
                          </span>
                          {needsTrackerUpdate(hb?.agentVersion) && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full" title={`Must update to v${TRACKER_MIN_VERSION}`}>
                              <AlertTriangle className="h-3 w-3" /> Update Required
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                          <WifiOff className="h-3 w-3" /> {hb ? 'Offline' : 'Not installed'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {canManage ? (
                        <>
                          <button
                            onClick={() => handleToggle(emp.email, !settings.enabled)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                          <div className="mt-1">
                            <Badge variant={settings.enabled ? 'success' : 'default'}>{settings.enabled ? 'Active' : 'Off'}</Badge>
                          </div>
                        </>
                      ) : (
                        <Badge variant={settings.enabled ? 'success' : 'default'}>{settings.enabled ? 'Active' : 'Off'}</Badge>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-6 py-4 text-center">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          max="60"
                          value={settings.intervalMinutes}
                          onChange={(e) => handleIntervalChange(emp.email, Number(e.target.value))}
                          onBlur={(e) => { if (Number(e.target.value) < 1) handleIntervalChange(emp.email, 1); }}
                          className="w-20 bg-slate-50 border border-slate-200 rounded-md py-1.5 px-2 text-center text-xs focus:border-orange-500 outline-none"
                          title="Minimum 1 minute"
                        />
                      </td>
                    )}
                    {canManage && (
                      <td className="px-6 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={settings.excludeFromAutoDelete}
                          onChange={(e) => handleExcludeToggle(emp.email, e.target.checked)}
                          className="h-4 w-4 accent-orange-600 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col sm:flex-row justify-center gap-2">
                        {canManage && (
                        <button
                          onClick={() => handleOpenSetup(emp)}
                          className="text-[10px] font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2 py-1.5 rounded-lg active:scale-97 transition-colors transition-transform flex items-center gap-1.5"
                        >
                          <Settings className="h-3.5 w-3.5" /> Setup Agent
                        </button>
                        )}
                        <button
                          onClick={() => handleOpenViewer(emp)}
                          className="text-[10px] font-bold text-slate-600 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg active:scale-97 transition-colors transition-transform flex items-center gap-1.5"
                        >
                          <ImageIcon className="h-3.5 w-3.5" /> Screenshots
                        </button>
                        <button
                          onClick={() => handleOpenMouseView(emp)}
                          className="text-[10px] font-bold text-slate-600 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg active:scale-97 transition-colors transition-transform flex items-center gap-1.5"
                        >
                          <MousePointerClick className="h-3.5 w-3.5" /> Mouse Activity
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 7 : 5} className="py-12 text-center text-slate-400 font-semibold italic">
                    {canManage ? 'No employees found.' : 'No teammates found on your team(s) yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Mobile card stack */}
        <div className="md:hidden space-y-3 p-4">
          {filteredEmployees.map(emp => {
            const settings = settingsFor(emp.email);
            const hb = heartbeatFor(emp.email);
            const isLive = hrActions.isHeartbeatLive(hb, settings.intervalMinutes);
            return (
              <div key={emp.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{displayName(emp, role)}</p>
                    <p className="text-[10px] text-slate-500">{emp.email}</p>
                  </div>
                  {isLive ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full shrink-0" title={hb?.deviceLabel || ''}>
                      <Wifi className="h-3 w-3" /> Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full shrink-0">
                      <WifiOff className="h-3 w-3" /> {hb ? 'Offline' : 'Not installed'}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-y-3 gap-x-2 mt-2">
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Region</p>
                    <p className="text-xs font-semibold text-slate-700">{emp.region || 'Pakistan'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Tracking</p>
                    {canManage ? (
                      <div className="flex items-center gap-2 mt-0.5">
                        <button
                          onClick={() => handleToggle(emp.email, !settings.enabled)}
                          className={`relative inline-flex h-5 w-9 shrink-0 flex-none items-center rounded-full transition-colors ${settings.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${settings.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                        <Badge variant={settings.enabled ? 'success' : 'default'} className="text-[9px] px-1.5 py-0">
                          {settings.enabled ? 'Active' : 'Off'}
                        </Badge>
                      </div>
                    ) : (
                      <Badge variant={settings.enabled ? 'success' : 'default'} className="text-[9px] px-1.5 py-0 mt-0.5">
                        {settings.enabled ? 'Active' : 'Off'}
                      </Badge>
                    )}
                  </div>
                  {canManage && (
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase mb-1">Interval (min)</p>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        max="60"
                        value={settings.intervalMinutes}
                        onChange={(e) => handleIntervalChange(emp.email, Number(e.target.value))}
                        onBlur={(e) => { if (Number(e.target.value) < 1) handleIntervalChange(emp.email, 1); }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-md py-1.5 px-2 text-xs focus:border-orange-500 outline-none"
                      />
                    </div>
                  )}
                  {canManage && (
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase mb-1">Exclude Auto-Delete</p>
                      <label className="flex items-center gap-2 cursor-pointer mt-1.5">
                        <input
                          type="checkbox"
                          checked={settings.excludeFromAutoDelete}
                          onChange={(e) => handleExcludeToggle(emp.email, e.target.checked)}
                          className="h-4 w-4 accent-orange-600 cursor-pointer"
                        />
                        <span className="text-xs text-slate-600 font-medium">{settings.excludeFromAutoDelete ? 'Yes' : 'No'}</span>
                      </label>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => handleOpenViewer(emp)}
                    className="w-full text-[10px] font-bold text-slate-600 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 py-2.5 rounded-lg active:scale-97 transition-colors transition-transform flex items-center justify-center gap-1.5"
                  >
                    <ImageIcon className="h-3.5 w-3.5" /> View Screenshots
                  </button>
                  <div className="flex gap-2">
                    {canManage && (
                      <button
                        onClick={() => handleOpenSetup(emp)}
                        className="flex-1 text-[10px] font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 py-2.5 rounded-lg active:scale-97 transition-colors transition-transform flex items-center justify-center gap-1.5"
                      >
                        <Settings className="h-3.5 w-3.5" /> Setup Agent
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenMouseView(emp)}
                      className="flex-1 text-[10px] font-bold text-slate-600 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 py-2.5 rounded-lg active:scale-97 transition-colors transition-transform flex items-center justify-center gap-1.5"
                    >
                      <MousePointerClick className="h-3.5 w-3.5" /> Mouse Activity
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredEmployees.length === 0 && (
            <p className="py-8 text-center text-slate-400 font-semibold italic text-sm">No employees found.</p>
          )}
        </div>
      </Card>

      {/* Setup Agent Modal */}
      <Modal isOpen={!!setupEmp} onClose={() => setSetupEmp(null)} title={setupEmp ? `Setup Agent — ${displayName(setupEmp, role)}` : 'Setup Agent'}>
        {setupEmp && (() => {
          const settings = settingsFor(setupEmp.email);
          return (
            <div className="space-y-5">
              <div className="space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  <span className="font-bold text-slate-800">Step 1.</span> Have the employee download the <span className="font-semibold">DelCargo Tracker</span> app for their computer (no Python or setup required) and install it like any other program.
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={TRACKER_DOWNLOAD_WINDOWS_URL}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 px-3 py-2 rounded-lg active:scale-97 transition-colors transition-transform"
                  >
                    <Download className="h-3.5 w-3.5" /> Download for Windows
                  </a>
                  <a
                    href={TRACKER_DOWNLOAD_MAC_URL}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 px-3 py-2 rounded-lg active:scale-97 transition-colors transition-transform"
                  >
                    <Download className="h-3.5 w-3.5" /> Download for Mac
                  </a>
                  <a
                    href={TRACKER_DOWNLOAD_CHROMEOS_URL}
                    download="Delcargo_Chromebook_Tracker.zip"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-3 py-2 rounded-lg active:scale-97 transition-colors transition-transform"
                  >
                    <Download className="h-3.5 w-3.5" /> Chrome OS Extension (.zip)
                  </a>
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-200 pt-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  <span className="font-bold text-slate-800">Step 2.</span> Copy this one-time setup code and have them paste it into the app when it first opens.
                </p>
                <div className="bg-slate-900 text-slate-100 rounded-lg p-3 font-mono text-[10px] leading-relaxed overflow-x-auto break-all">
                  {encodeSetupCode(getPocketBaseConfig().url, settings.agentToken)}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => copySetupCode(settings)}
                    className="text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 px-3 py-2 rounded-lg flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
                  >
                    <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied!' : 'Copy Setup Code'}
                  </button>
                  <button
                    onClick={() => handleRegenerateToken(setupEmp.email)}
                    className="text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-lg flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Regenerate Token
                  </button>
                </div>
              </div>

              <details className="border-t border-slate-200 pt-3">
                <summary className="text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer">Advanced: raw script (requires Python)</summary>
                <div className="mt-2 space-y-2">
                  <div className="bg-slate-900 text-slate-100 rounded-lg p-3 font-mono text-[10px] leading-relaxed overflow-x-auto whitespace-pre">
{`POCKETBASE_URL=${POCKETBASE_URL}
AGENT_TOKEN=${settings.agentToken}`}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => copyConfig(settings)}
                      className="text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy Config
                    </button>
                    <a
                      href={AGENT_SCRIPT_PATH}
                      download
                      className="text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
                    >
                      <Download className="h-3.5 w-3.5" /> Download .py Script
                    </a>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Requires Python 3 installed on the employee&apos;s machine. Run <code className="bg-slate-100 px-1 rounded">pip install pyautogui pillow requests --break-system-packages</code> then <code className="bg-slate-100 px-1 rounded">python delcargo_tracker_agent.py</code>.
                  </p>
                </div>
              </details>

              <p className="text-[10px] text-slate-400 leading-relaxed border-t border-slate-200 pt-3">
                Tracking must be toggled &quot;Active&quot; above for captures to be accepted. The app only captures while that toggle is on and (for remote employees) their shift is active.
              </p>
            </div>
          );
        })()}
      </Modal>

      {/* Screenshot Viewer Modal */}
      <Modal isOpen={!!viewerEmp} onClose={() => setViewerEmp(null)} title={viewerEmp ? `Screenshots — ${displayName(viewerEmp, role)}` : 'Screenshots'}>
        {viewerEmp && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                  <button
                    onClick={() => handleRangeChange('day')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors transition-shadow ${viewerRange === 'day' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                  >
                    Daily
                  </button>
                  <button
                    onClick={() => handleRangeChange('week')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors transition-shadow ${viewerRange === 'week' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                  >
                    Weekly
                  </button>
                  <button
                    onClick={() => handleRangeChange('month')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors transition-shadow ${viewerRange === 'month' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                  >
                    Monthly
                  </button>
                </div>
                {viewerRange === 'day' && (
                  <input
                    type="date"
                    value={viewerDay}
                    max={localDateString()}
                    onChange={e => handleDayChange(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-orange-500"
                  />
                )}
              </div>
              <button
                onClick={handleExportZip}
                disabled={viewerShots.length === 0 || exporting}
                className="text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 px-3 py-2 rounded-lg flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
              >
                <Download className="h-3.5 w-3.5" /> {exporting ? 'Exporting…' : `Export ${viewerShots.length} as ZIP`}
              </button>
            </div>

            {/* Mouse Inactivity Summary — total idle time + when it happened,
                reported by the desktop agent (see agent_gui.py's
                _inactivity_loop). Most meaningful on the Daily view (one
                shift), but shown for Weekly/Monthly too. */}
            {!viewerLoading && (
              <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                    <MousePointerClick className="h-3.5 w-3.5" /> Mouse Inactivity (3+ min stretches)
                  </span>
                  <span className="text-xs font-bold text-amber-800">
                    {viewerInactivity.length === 0 ? 'None recorded' : `${formatDuration(totalInactiveSeconds)} total`}
                  </span>
                </div>
                {viewerInactivity.length > 0 && (
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                    {viewerInactivity.map(log => (
                      <div key={log.id} className="flex items-center justify-between text-[10px] text-amber-700 font-semibold">
                        <span>
                          {formatShortDateNY(log.startAt)}, {formatTimeNY(log.startAt)}
                          {' – '}
                          {formatTimeNY(log.endAt)}
                        </span>
                        <span>{formatDuration(log.durationSeconds)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {viewerLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-24 bg-slate-200/70 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : viewerShots.length === 0 ? (
              <p className="text-center text-slate-400 text-xs font-semibold italic py-10">No screenshots captured in this period.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto pr-1">
                {viewerShots.map((shot, idx) => (
                  <button
                    key={shot.id}
                    onClick={() => openLightbox(idx)}
                    className="space-y-1 text-left group"
                  >
                    <div className="relative overflow-hidden rounded-lg border border-slate-200 group-hover:border-orange-300 transition-colors">
                      <OptimizedImage
                        src={shot.imageUrl}
                        alt="Screenshot"
                        width={300}
                        height={180}
                        className="w-full h-24 object-cover"
                      />
                      <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/30 transition-colors flex items-center justify-center">
                        <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-400 font-semibold text-center">{formatDateTimeNY(shot.timestamp)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Mouse Activity Modal — dedicated detail view of inactivity data,
          separate from the Screenshots modal's compact summary. */}
      <Modal isOpen={!!mouseEmp} onClose={() => setMouseEmp(null)} title={mouseEmp ? `Mouse Activity — ${displayName(mouseEmp, role)}` : 'Mouse Activity'}>
        {mouseEmp && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                  <button
                    onClick={() => handleMouseRangeChange('day')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors transition-shadow ${mouseRange === 'day' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                  >
                    Daily
                  </button>
                  <button
                    onClick={() => handleMouseRangeChange('week')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors transition-shadow ${mouseRange === 'week' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                  >
                    Weekly
                  </button>
                  <button
                    onClick={() => handleMouseRangeChange('month')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors transition-shadow ${mouseRange === 'month' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                  >
                    Monthly
                  </button>
                </div>
                {mouseRange === 'day' && (
                  <input
                    type="date"
                    value={mouseDay}
                    max={localDateString()}
                    onChange={e => handleMouseDayChange(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-orange-500"
                  />
                )}
              </div>
            </div>

            {mouseLoading ? (
              <p className="text-center text-slate-400 text-xs font-semibold py-10">Loading mouse activity…</p>
            ) : (
              <>
                {/* Stat cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                    <p className="text-sm font-bold text-slate-800">{mouseShiftSeconds > 0 ? formatDuration(mouseShiftSeconds) : '—'}</p>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Shift Time</p>
                  </div>
                  <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 text-center">
                    <p className="text-sm font-bold text-amber-800">{formatDuration(mouseTotalSeconds)}</p>
                    <p className="text-[9px] text-amber-600 font-bold uppercase tracking-wider mt-0.5">Total Inactive</p>
                  </div>
                  <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 text-center" title="Shift Time minus Total Inactive">
                    <p className="text-sm font-bold text-emerald-800">{mouseShiftSeconds > 0 ? formatDuration(mouseActiveSeconds) : '—'}</p>
                    <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider mt-0.5">Active Time</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                    <p className="text-sm font-bold text-slate-800">{mouseLogs.length}</p>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Events</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                    <p className="text-sm font-bold text-slate-800">{mouseLogs.length ? formatDuration(mouseLongestSeconds) : '—'}</p>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Longest Stretch</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                    <p className="text-sm font-bold text-slate-800">{mouseLogs.length ? formatDuration(mouseAvgSeconds) : '—'}</p>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Average / Event</p>
                  </div>
                </div>

                {/* Active vs Inactive proportion — simple stacked bar, no
                    charting library needed (this app has none installed;
                    plain divs keep it dependency-free). */}
                {mouseShiftSeconds > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      <span>Active vs Inactive (this period)</span>
                      <span>{Math.round((mouseActiveSeconds / mouseShiftSeconds) * 100)}% active</span>
                    </div>
                    <div className="w-full h-4 rounded-full overflow-hidden flex bg-slate-100 border border-slate-200">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${Math.max(0, Math.min(100, (mouseActiveSeconds / mouseShiftSeconds) * 100))}%` }}
                        title={`Active: ${formatDuration(mouseActiveSeconds)}`}
                      />
                      <div
                        className="h-full bg-amber-400"
                        style={{ width: `${Math.max(0, Math.min(100, (mouseTotalSeconds / mouseShiftSeconds) * 100))}%` }}
                        title={`Inactive: ${formatDuration(mouseTotalSeconds)}`}
                      />
                    </div>
                    <div className="flex items-center gap-4 text-[9px] font-semibold text-slate-500">
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Active</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Inactive</span>
                    </div>
                  </div>
                )}

                {/* Inactive time per day — bar chart, oldest to newest left to
                    right. On the Daily view this is a single bar; on
                    Weekly/Monthly it makes patterns (e.g. always sluggish on
                    a particular day) easy to spot at a glance. */}
                {mouseLogs.length > 0 && (() => {
                  const chronological = [...mouseLogsByDay()].reverse();
                  const maxSeconds = Math.max(...chronological.map(g => g.totalSeconds), 1);
                  return (
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Inactive Time by Day</p>
                      <div className="flex items-end gap-2 h-28 border-b border-slate-200 pb-1 overflow-x-auto">
                        {chronological.map(group => (
                          <div key={group.day} className="flex flex-col items-center gap-1 min-w-[2.5rem] shrink-0" title={`${group.day}: ${formatDuration(group.totalSeconds)}`}>
                            <span className="text-[8px] font-bold text-amber-700">{formatDuration(group.totalSeconds)}</span>
                            <div
                              className="w-6 bg-amber-400 rounded-t-sm"
                              style={{ height: `${Math.max(4, (group.totalSeconds / maxSeconds) * 80)}px` }}
                            />
                            <span className="text-[8px] font-semibold text-slate-400 whitespace-nowrap">{group.day.replace(/, \d{4}$/, '')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Detailed breakdown — grouped by day so Weekly/Monthly still
                    show clearly "when" each stretch happened, not just a flat
                    list. On the Daily view this collapses to a single group. */}
                {mouseLogs.length === 0 ? (
                  <p className="text-center text-slate-400 text-xs font-semibold italic py-10">
                    No mouse inactivity of 3+ minutes recorded in this period.
                  </p>
                ) : (
                  <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                    {mouseLogsByDay().map(group => (
                      <div key={group.day} className="space-y-1.5">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                          <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">{group.day}</p>
                          <p className="text-[10px] font-bold text-amber-700">{formatDuration(group.totalSeconds)} total</p>
                        </div>
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                              <th className="py-1 font-bold">Start</th>
                              <th className="py-1 font-bold">End</th>
                              <th className="py-1 font-bold text-right">Duration</th>
                              <th className="py-1 font-bold text-right">Device</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {group.logs.map(log => (
                              <tr key={log.id}>
                                <td className="py-1.5 font-semibold text-slate-700">{formatTimeNY(log.startAt)}</td>
                                <td className="py-1.5 font-semibold text-slate-700">{formatTimeNY(log.endAt)}</td>
                                <td className="py-1.5 font-bold text-amber-700 text-right">{formatDuration(log.durationSeconds)}</td>
                                <td className="py-1.5 text-slate-400 text-[10px] text-right">{log.deviceLabel || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

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
    </div>
  );
}
