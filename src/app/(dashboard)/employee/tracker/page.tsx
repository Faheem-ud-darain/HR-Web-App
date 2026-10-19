'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useProfiles, useTimesheets, hrActions, Profile, TimesheetEntry, TrackingSettings, TrackerHeartbeat, localShiftDate, hasStaleTrackerToken } from '@/lib/hrData';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { encodeSetupCode, getPocketBaseConfig, TRACKER_DOWNLOAD_WINDOWS_URL, TRACKER_DOWNLOAD_MAC_URL, TRACKER_DOWNLOAD_CHROMEOS_URL, TRACKER_MIN_VERSION, needsTrackerUpdate, detectOS } from '@/lib/trackerSetup';
import { Timer, Monitor, ShieldAlert, MapPin, Download, Copy, RefreshCw, Wifi, WifiOff, AlertTriangle, Settings2, Activity } from 'lucide-react';
import { formatTimeNY } from '@/lib/timezone';
import { EmployeeActivityInsights } from '@/components/ui/lazy';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TableScroll, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSessionEmail } from '@/lib/useSession';
import { useIsClient } from '@/lib/useIsClient';
import { setAdaptiveInterval, every } from '@/lib/idle';

export default function TrackerPage() {
  // 'setup' is the existing tab (connection status + shift history) shown by
  // default. 'activity' is new — its data (a 7-day inactivity-log fetch,
  // see EmployeeActivityInsights) is only requested once the employee
  // actually clicks that tab, never on page load/login, since
  // EmployeeActivityInsights isn't mounted until activeTab === 'activity'.
  const [activeTab, setActiveTab] = useState<'setup' | 'activity'>('setup');
  const queryClient = useQueryClient();
  const sessionEmail = useSessionEmail();
  const { data: allProfiles = [] } = useProfiles();
  const { data: allTimesheets = [], refetch: refetchTimesheets } = useTimesheets({ email: sessionEmail || undefined, enabled: !!sessionEmail });

  const profile: Profile | null = useMemo(
    () => allProfiles.find(e => e.email && sessionEmail && e.email.toLowerCase() === sessionEmail.toLowerCase()) || null,
    [allProfiles, sessionEmail],
  );
  const profileEmail = profile?.email ?? null;

  // This person's shifts, newest first; the open one (if any) drives the live ticker.
  const timesheetEntries: TimesheetEntry[] = useMemo(
    () => (profileEmail
      ? allTimesheets.filter(t => t.employeeEmail.toLowerCase() === profileEmail.toLowerCase()).sort((a, b) => (b.clockIn || '').localeCompare(a.clockIn || ''))
      : []),
    [allTimesheets, profileEmail],
  );
  const openShift: TimesheetEntry | null = useMemo(() => timesheetEntries.find(t => t.status === 'in_progress') || null, [timesheetEntries]);

  // Poll for shift changes made elsewhere (e.g. geofence auto clock-in/out happening on the
  // dashboard page) so this view stays in sync.
  useEffect(() => {
    if (!profileEmail) return;
    return setAdaptiveInterval(() => { void refetchTimesheets(); }, 5000);
  }, [profileEmail, refetchTimesheets]);

  // Live elapsed-time ticker for the currently open shift, computed from the real clock-in
  // timestamp — not a locally-simulated counter, so it stays correct across page reloads.
  const [tickNow, setTickNow] = useState(0);
  useEffect(() => {
    if (!openShift) return;
    const first = setTimeout(() => setTickNow(Date.now()), 0);
    const timer = setInterval(() => setTickNow(Date.now()), 1000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [openShift]);
  const elapsedLabel = useMemo(() => {
    if (!openShift || tickNow === 0) return '0h 0m 0s';
    const diffSecs = Math.max(0, Math.floor((tickNow - new Date(openShift.clockIn).getTime()) / 1000));
    return `${Math.floor(diffSecs / 3600)}h ${Math.floor((diffSecs % 3600) / 60)}m ${diffSecs % 60}s`;
  }, [openShift, tickNow]);

  // The live "is the desktop app actually connected" heartbeat, re-checked every 30s while this
  // page is open so the badge updates on its own without the employee clicking Reconnect.
  const heartbeatKey = ['tracker_heartbeat', (profileEmail || '').toLowerCase()] as const;
  const { data: heartbeat = null, isFetching: heartbeatChecking, isFetched: heartbeatCheckedOnce, refetch: refetchHeartbeat } = useQuery<TrackerHeartbeat | null>({
    queryKey: heartbeatKey,
    enabled: !!profileEmail,
    queryFn: async () => (await hrActions.getTrackerHeartbeat(profileEmail as string)) ?? null,
    refetchInterval: every(30000),
    staleTime: 0,
  });

  // Employee self-service: fetch (and if needed, create) this employee's own tracking settings
  // row. Scoped strictly to their own logged-in email — never any other employee's. Creating an
  // agentToken here does NOT turn tracking on; that "enabled" flag is still only ever flipped by
  // HR/Admin or by this employee's own Start/End Shift buttons on the Dashboard page.
  const { data: ownTrackingSettings, refetch: refetchOwnSettings } = useQuery<TrackingSettings | null>({
    queryKey: ['own_tracking_settings', (profileEmail || '').toLowerCase()],
    enabled: !!profileEmail,
    queryFn: async () => {
      let settings = await hrActions.getTrackingSettingsFor(profileEmail as string);
      if (!settings.agentToken) settings = await hrActions.updateTrackingSettings(profileEmail as string, {});
      return settings || null;
    },
  });
  const trackingSettings = ownTrackingSettings ?? null;

  const isClient = useIsClient();
  const detectedOS: 'windows' | 'mac' | 'cros' | 'other' = isClient ? detectOS() : 'other';
  const [codeCopied, setCodeCopied] = useState(false);
  const [forceDisconnecting, setForceDisconnecting] = useState(false);
  const [showForceDisconnectConfirm, setShowForceDisconnectConfirm] = useState(false);
  const [showRegenerateCodeConfirm, setShowRegenerateCodeConfirm] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);

  const handleReconnectCheck = () => {
    if (!profile) return;
    void refetchHeartbeat();
  };

  // Escape hatch for "another device is active" / a stuck superseded state
  // blocking a new computer from claiming this account's tracker. Clears
  // every tracker session key server-side (see forceDisconnectAllTrackers)
  // then resets this page's own connection state so it reflects "not
  // connected" immediately, instead of waiting out any staleness window.
  const handleForceDisconnectAll = () => {
    if (!profile) return;
    setShowForceDisconnectConfirm(true);
  };

  const confirmForceDisconnectAll = async () => {
    if (!profile) return;
    setShowForceDisconnectConfirm(false);
    setForceDisconnecting(true);
    try {
      await hrActions.forceDisconnectAllTrackers(profile.email);
      queryClient.setQueryData(heartbeatKey, null); // show "not connected" immediately
    } finally {
      setForceDisconnecting(false);
    }
  };

  const handleCopySetupCode = () => {
    if (!trackingSettings?.agentToken) return;
    const { url } = getPocketBaseConfig();
    const code = encodeSetupCode(url, trackingSettings.agentToken);
    navigator.clipboard.writeText(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleRegenerateOwnCode = () => {
    if (!profile) return;
    setShowRegenerateCodeConfirm(true);
  };

  const confirmRegenerateOwnCode = async () => {
    if (!profile) return;
    setShowRegenerateCodeConfirm(false);
    setRegeneratingCode(true);
    try {
      await hrActions.regenerateAgentToken(profile.email);
      await refetchOwnSettings();
    } finally {
      setRegeneratingCode(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-slate-900">Shift Tracker</h1>
          <p className="text-xs md:text-sm text-slate-500">
            {activeTab === 'setup'
              ? 'Real clock-in / clock-out history, sourced directly from your synced shift records — no simulated data.'
              : 'Your own daily activity vs. inactivity, over the last week.'}
          </p>
        </div>

        {/* Tab switcher */}
        <Tabs
          variant="segmented"
          className="self-start md:self-auto"
          value={activeTab}
          onChange={setActiveTab}
          items={[
            { value: 'setup', label: 'Setup & History', icon: <Settings2 className="h-4 w-4 text-orange-500" /> },
            { value: 'activity', label: 'My Activity', icon: <Activity className="h-4 w-4 text-emerald-600" /> },
          ]}
        />
      </div>

      {activeTab === 'activity' ? (
        profile ? (
          <EmployeeActivityInsights employeeEmail={profile.email} timesheets={timesheetEntries} />
        ) : (
          // profile resolves a beat after allProfiles loads — previously this
          // rendered nothing at all in that gap, which looked like a broken/
          // empty tab for a moment. A small loading state matches how the
          // rest of this page already behaves before its own data is ready.
          <Card className="border border-slate-200 bg-white">
            <CardContent className="py-16 text-center text-xs font-semibold text-slate-400">Loading…</CardContent>
          </Card>
        )
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-8">

        {/* Current shift status (left 5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <Card className={`border-t-4 shadow-md ${openShift ? 'border-t-emerald-500 bg-white' : 'border-t-slate-300 bg-slate-50/50'}`}>
            <CardContent className="p-6 space-y-6">
              {openShift ? (
                <div className="text-center space-y-2">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full w-fit mx-auto flex items-center gap-1.5 animate-pulse">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> On Shift
                  </span>
                  <div className="text-3xl md:text-4xl font-bold text-slate-900 font-mono pt-2 flex items-center justify-center gap-2">
                    <Timer className="h-8 w-8 text-emerald-500" />
                    {elapsedLabel}
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                    Clocked in at {formatTimeNY(openShift.clockIn)}
                    {profile?.region === 'USA' ? ' via GPS warehouse geofencing.' : ' (manual shift start).'}
                  </p>
                </div>
              ) : (
                <div className="text-center py-8 space-y-3 font-sans">
                  <ShieldAlert className="h-10 w-10 text-slate-300 mx-auto" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Off Shift</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed font-semibold">
                      {profile?.region === 'USA'
                        ? 'Your shift will start automatically when your device enters your assigned warehouse geofence (see the Dashboard page).'
                        : 'Start your shift manually from the Dashboard page when you begin work.'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {profile?.region === 'USA' && (
            <Card className="border border-slate-200 bg-white">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-orange-500" /> Location-Based Attendance
                </h3>
              </div>
              <CardContent className="p-5 text-xs text-slate-500 font-semibold leading-relaxed">
                Shift start/end for USA warehouse staff is fully automatic and based on your device&apos;s real GPS location relative to your assigned warehouse. Manage and view live geofence status from the Dashboard page.
              </CardContent>
            </Card>
          )}

          {/* Self-service screen tracking setup — no need to ask HR/Admin for a link or code */}
          <Card className="border border-slate-200 bg-white">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Monitor className="h-3.5 w-3.5 text-orange-500" /> Workstation Activity Monitoring
              </h3>
              <Badge variant={trackingSettings?.enabled ? 'success' : 'default'}>
                {trackingSettings?.enabled ? 'Active' : 'Off'}
              </Badge>
            </div>
            <CardContent className="p-5 space-y-3 font-sans">
              <p className="text-[10px] text-slate-400 leading-relaxed font-semibold">
                Install the free DelCargo Tracker app once — it runs quietly in the background (system tray) and only tracks activity while HR/Admin has tracking enabled for you and you&apos;re on a manually-started shift.
              </p>
              <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed font-bold">
                While tracking is active please avoid personal browsing, messages, or accounts on this device while on shift.
              </p>

              {/* Live "is the desktop app actually installed & reachable" indicator —
                  separate from the Active/Off badge above, which only reflects whether
                  HR/Admin has authorized capturing. Sourced from the agent's own
                  periodic heartbeat check-in, not from anything this web page assumes. */}
              <div className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${hrActions.isHeartbeatLive(heartbeat) ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-1.5">
                  {hrActions.isHeartbeatLive(heartbeat) ? (
                    <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 text-slate-400" />
                  )}
                  <div>
                    <p className={`text-[10px] font-bold ${hrActions.isHeartbeatLive(heartbeat) ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {hrActions.isHeartbeatLive(heartbeat)
                        ? `App Connected${heartbeat?.deviceLabel ? ` — ${heartbeat.deviceLabel}` : ''}${heartbeat?.agentVersion ? ` (v${heartbeat.agentVersion})` : ''}`
                        : heartbeatCheckedOnce ? 'App Not Connected' : 'Checking connection…'}
                    </p>
                    {heartbeat?.lastSeenAt && (
                      <p className="text-[9px] text-slate-400 font-semibold">Last check-in: {formatTimeNY(heartbeat.lastSeenAt)}</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReconnectCheck}
                  disabled={heartbeatChecking}
                  className="!text-[9px] !px-2 active:scale-97 transition-transform shrink-0"
                >
                  <RefreshCw className={`h-3 w-3 ${heartbeatChecking ? 'animate-spin' : ''}`} /> Reconnect
                </Button>
              </div>
              {heartbeatCheckedOnce && !hrActions.isHeartbeatLive(heartbeat) && (
                <>
                  <p className="text-[9px] text-slate-400 leading-relaxed -mt-1">
                    If you&apos;ve installed the app, make sure it&apos;s running (check your system tray / menu bar), then click Reconnect. If you haven&apos;t installed it yet, use the button below.
                  </p>
                  <p className="text-[9px] text-slate-400 leading-relaxed -mt-1">
                    Switching to a new computer and blocked by a &quot;device already connected&quot; error?{' '}
                    <button
                      onClick={handleForceDisconnectAll}
                      disabled={forceDisconnecting}
                      className="font-bold text-rose-600 hover:text-rose-700 disabled:opacity-50 underline underline-offset-2"
                    >
                      {forceDisconnecting ? 'Disconnecting…' : 'Force Disconnect All Trackers'}
                    </button>
                  </p>
                </>
              )}

              {trackingSettings?.agentToken ? (
                <>
                  {/* Update-required banner — shown when the connected agent is
                      running an older build than TRACKER_MIN_VERSION. Employees
                      whose agent predates v6 (no agentVersion in heartbeat)
                      are silently ignored — the download buttons below always
                      point to /releases/latest so they'll get the right build. */}
                  {hrActions.isHeartbeatLive(heartbeat) && needsTrackerUpdate(heartbeat?.agentVersion, heartbeat?.deviceLabel) && (
                    <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-xl px-3.5 py-3">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-[11px] font-bold text-amber-900">Tracker Update Required — v{TRACKER_MIN_VERSION}</p>
                        <p className="text-[10px] text-amber-700 leading-relaxed">
                          You&apos;re running v{heartbeat?.agentVersion ?? 'unknown'}. Download the latest installer below, run it, and your tracker will reconnect automatically.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Reconnect-required banner — shown when the agent is live
                      and current but presenting a setup code that HR/Admin
                      has since regenerated (no matching row in
                      hr_tracking_settings anymore). Screen tracking silently
                      cannot function until the employee re-pastes the new
                      code below — this is also what blocks Start Shift on
                      the main dashboard (see hasStaleTrackerToken() usage in
                      employee/page.tsx). */}
                  {hasStaleTrackerToken(heartbeat) && (
                    <div className="flex items-start gap-2.5 bg-orange-50 border border-orange-300 rounded-xl px-3.5 py-3">
                      <RefreshCw className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-[11px] font-bold text-orange-900">Reconnect Required — Setup Code Changed</p>
                        <p className="text-[10px] text-orange-700 leading-relaxed">
                          Your setup code was regenerated by HR/Admin. Copy the new code below and paste it into the DelCargo Tracker app on your computer to reconnect — your shift can&apos;t start with screen tracking until you do.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Direct-download links straight to the installer file (not the
                      GitHub Releases page) — clicking starts the download
                      immediately instead of sending the employee to GitHub to
                      find and click the right asset themselves. The button
                      matching their detected OS is highlighted first. */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <a
                      href={TRACKER_DOWNLOAD_WINDOWS_URL}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg active:scale-97 transition-colors transition-transform flex-1 justify-center ${detectedOS === 'windows' ? 'text-white bg-orange-600 hover:bg-orange-700' : 'text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200'}`}
                    >
                      <Download className="h-3.5 w-3.5" /> Download for Windows
                    </a>
                    <a
                      href={TRACKER_DOWNLOAD_MAC_URL}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg active:scale-97 transition-colors transition-transform flex-1 justify-center ${detectedOS === 'mac' ? 'text-white bg-orange-600 hover:bg-orange-700' : 'text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200'}`}
                    >
                      <Download className="h-3.5 w-3.5" /> Download for Mac
                    </a>
                    <a
                      href={TRACKER_DOWNLOAD_CHROMEOS_URL}
                      download="Delcargo_Chromebook_Tracker.zip"
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg active:scale-97 transition-colors transition-transform flex-1 justify-center ${detectedOS === 'cros' ? 'text-white bg-orange-600 hover:bg-orange-700' : 'text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200'}`}
                    >
                      <Download className="h-3.5 w-3.5" /> Chrome OS Extension (.zip)
                    </a>
                  </div>

                  <div>
                    <p className="text-[10px] text-slate-500 font-semibold mb-1">Paste this code into the app when it first opens:</p>
                    <div className="bg-slate-900 text-slate-100 rounded-lg p-3 font-mono text-[10px] leading-relaxed overflow-x-auto break-all">
                      {encodeSetupCode(getPocketBaseConfig().url, trackingSettings.agentToken)}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleCopySetupCode}
                      className="text-[10px] font-bold text-white bg-slate-800 hover:bg-slate-900 px-3 py-2 rounded-lg flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
                    >
                      <Copy className="h-3.5 w-3.5" /> {codeCopied ? 'Copied!' : 'Copy My Setup Code'}
                    </button>
                    <button
                      onClick={handleRegenerateOwnCode}
                      className="text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-lg flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Regenerate My Code
                    </button>
                  </div>

                  <p className="text-[9px] text-slate-400 leading-relaxed border-t border-slate-200 pt-2">
                    This code is unique to your account only — don&apos;t share it with a coworker, and don&apos;t paste someone else&apos;s code into your own tracker app. The app will show you which email address it connected as before it starts — always double-check that&apos;s you.
                  </p>
                </>
              ) : (
                <p className="text-[10px] text-slate-400 italic">Preparing your setup code…</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Real timesheet log (right 7 cols) */}
        <div className="lg:col-span-7">
          <Card className="border border-slate-200 h-full">
            <div className="px-4 md:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Shift History</h3>
              <Badge variant="default">Total: {timesheetEntries.length} Shifts</Badge>
            </div>
            <CardContent className="p-0">
              {/* Desktop table */}
              <TableScroll hideOnMobile>
                <Table density="cozy" size="xs">
                  <THead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Clock In</Th>
                      <Th>Clock Out</Th>
                      <Th align="right">Duration</Th>
                      <Th align="right">Status</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {timesheetEntries.map((entry) => (
                      <Tr key={entry.id} className="hover:bg-slate-100/30">
                        <Td density="comfortable" className="font-bold text-slate-800">{localShiftDate(entry.clockIn, entry.date)}</Td>
                        <Td density="comfortable" className="text-slate-600 font-medium font-mono">{formatTimeNY(entry.clockIn)}</Td>
                        <Td density="comfortable" className="text-slate-600 font-medium font-mono">{entry.clockOut ? formatTimeNY(entry.clockOut) : '—'}</Td>
                        <Td align="right" density="comfortable" className="font-bold text-slate-900">{entry.duration || '—'}</Td>
                        <Td align="right" density="comfortable">
                          <Badge variant={entry.status === 'in_progress' ? 'warning' : 'success'}>
                            {entry.status === 'in_progress' ? 'On Shift' : 'Completed'}
                          </Badge>
                        </Td>
                      </Tr>
                    ))}
                    {timesheetEntries.length === 0 && (
                      <Tr>
                        <EmptyState as="td" colSpan={5} py={8}>No shifts recorded yet.</EmptyState>
                      </Tr>
                    )}
                  </TBody>
                </Table>
              </TableScroll>
              {/* Mobile card stack */}
              <div className="md:hidden space-y-2 p-3">
                {timesheetEntries.map((entry) => (
                  <div key={entry.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 shadow-sm">
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
                          {formatTimeNY(entry.clockIn)}
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
                {timesheetEntries.length === 0 && (
                  <EmptyState py={6} size="xs">No shifts recorded yet.</EmptyState>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
      )}

      <ConfirmDialog
        isOpen={showForceDisconnectConfirm}
        onClose={() => setShowForceDisconnectConfirm(false)}
        onConfirm={confirmForceDisconnectAll}
        title="Force-disconnect all trackers?"
        message={`This disconnects ALL trackers (desktop app or Chrome extension) currently linked to your account, including one that's genuinely still running elsewhere. Use this only if you're switching computers or stuck behind a "device already connected" error. Continue?`}
        confirmLabel={forceDisconnecting ? 'Disconnecting…' : 'Disconnect All'}
        variant="warning"
        loading={forceDisconnecting}
      />

      <ConfirmDialog
        isOpen={showRegenerateCodeConfirm}
        onClose={() => setShowRegenerateCodeConfirm(false)}
        onConfirm={confirmRegenerateOwnCode}
        title="Regenerate setup code?"
        message="Regenerating your setup code will disconnect the tracker app on any computer currently using your old code, until it is reconnected with the new one. Continue?"
        confirmLabel={regeneratingCode ? 'Regenerating…' : 'Regenerate'}
        variant="warning"
        loading={regeneratingCode}
      />
    </div>
  );
}
