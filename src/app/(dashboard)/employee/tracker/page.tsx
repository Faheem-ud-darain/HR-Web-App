'use client';

import React, { useState, useEffect } from 'react';
import { useProfiles, useTimesheets, hrActions, Profile, TimesheetEntry, TrackingSettings, TrackerHeartbeat, localShiftDate } from '@/lib/hrData';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { encodeSetupCode, getPocketBaseConfig, TRACKER_DOWNLOAD_WINDOWS_URL, TRACKER_DOWNLOAD_MAC_URL, TRACKER_DOWNLOAD_CHROMEOS_URL, TRACKER_MIN_VERSION, needsTrackerUpdate, detectOS } from '@/lib/trackerSetup';
import { getSessionEmail } from '@/lib/session';
import { Timer, Monitor, ShieldAlert, MapPin, Download, Copy, RefreshCw, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { formatTimeNY } from '@/lib/timezone';

export default function TrackerPage() {
  const { data: allProfiles = [] } = useProfiles();
  const { data: allTimesheets = [], refetch: refetchTimesheets } = useTimesheets();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [openShift, setOpenShift] = useState<TimesheetEntry | null>(null);
  const [timesheetEntries, setTimesheetEntries] = useState<TimesheetEntry[]>([]);
  const [elapsedLabel, setElapsedLabel] = useState('0h 0m 0s');
  const [trackingSettings, setTrackingSettings] = useState<TrackingSettings | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [heartbeat, setHeartbeat] = useState<TrackerHeartbeat | null>(null);
  const [heartbeatChecking, setHeartbeatChecking] = useState(false);
  const [heartbeatCheckedOnce, setHeartbeatCheckedOnce] = useState(false);
  const [detectedOS, setDetectedOS] = useState<'windows' | 'mac' | 'cros' | 'other'>('other');

  useEffect(() => {
    setDetectedOS(detectOS());
  }, []);

  useEffect(() => {
    const email = getSessionEmail();
    const employees = allProfiles;
    const userProfile = employees.find(e => e.email && email && e.email.toLowerCase() === email.toLowerCase());
    if (userProfile) {
      setProfile(userProfile);
      refreshShiftData(userProfile.email);
      loadOwnTrackingSettings(userProfile.email);
      refreshHeartbeat(userProfile.email);
    }
  }, [allProfiles]);

  // Poll the live "is the desktop app actually connected" heartbeat while
  // this page is open, so the badge below updates on its own without the
  // employee needing to keep clicking Reconnect just to check.
  useEffect(() => {
    if (!profile?.email) return;
    const interval = setInterval(() => refreshHeartbeat(profile.email), 30000);
    return () => clearInterval(interval);
  }, [profile]);

  const refreshHeartbeat = async (email: string) => {
    setHeartbeatChecking(true);
    try {
      const hb = await hrActions.getTrackerHeartbeat(email);
      setHeartbeat(hb);
    } finally {
      setHeartbeatChecking(false);
      setHeartbeatCheckedOnce(true);
    }
  };

  const handleReconnectCheck = () => {
    if (!profile) return;
    refreshHeartbeat(profile.email);
  };

  // Employee self-service: fetch (and if needed, create) this employee's own
  // tracking settings row. Scoped strictly to their own logged-in email —
  // never any other employee's — so this never grants or reveals access to
  // anyone else's setup. Creating an agentToken here does NOT turn tracking
  // on; that "enabled" flag is still only ever flipped by HR/Admin or by
  // this employee's own Start/End Shift buttons on the Dashboard page.
  const loadOwnTrackingSettings = async (email: string) => {
    let settings = await hrActions.getTrackingSettingsFor(email);
    if (!settings.agentToken) {
      const updated = await hrActions.updateTrackingSettings(email, {});
      settings = updated.find(s => s.employeeEmail.toLowerCase() === email.toLowerCase()) || settings;
    }
    setTrackingSettings(settings || null);
  };

  const handleCopySetupCode = () => {
    if (!trackingSettings?.agentToken) return;
    const { url } = getPocketBaseConfig();
    const code = encodeSetupCode(url, trackingSettings.agentToken);
    navigator.clipboard.writeText(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleRegenerateOwnCode = async () => {
    if (!profile) return;
    const confirmed = window.confirm('Regenerating your setup code will disconnect the tracker app on any computer currently using your old code, until it is reconnected with the new one. Continue?');
    if (!confirmed) return;
    await hrActions.regenerateAgentToken(profile.email);
    loadOwnTrackingSettings(profile.email);
  };

  const refreshShiftData = async (email: string) => {
    const { data } = await refetchTimesheets();
    const all = (data || []).filter(t => t.employeeEmail.toLowerCase() === email.toLowerCase());
    const open = all.find(t => t.status === 'in_progress') || null;
    setOpenShift(open);
    setTimesheetEntries(all.sort((a, b) => (b.clockIn || '').localeCompare(a.clockIn || '')));
  };

  // Live elapsed-time ticker for the currently open shift, computed from the
  // real clock-in timestamp — not a locally-simulated counter, so it stays
  // correct even across page reloads.
  useEffect(() => {
    if (!openShift) {
      setElapsedLabel('0h 0m 0s');
      return;
    }

    const tick = () => {
      const startMs = new Date(openShift.clockIn).getTime();
      const diffSecs = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      const hrs = Math.floor(diffSecs / 3600);
      const mins = Math.floor((diffSecs % 3600) / 60);
      const secs = diffSecs % 60;
      setElapsedLabel(`${hrs}h ${mins}m ${secs}s`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [openShift]);

  // Poll for shift changes made elsewhere (e.g. geofence auto clock-in/out
  // happening on the dashboard page) so this view stays in sync.
  useEffect(() => {
    if (!profile) return;
    const interval = setInterval(() => refreshShiftData(profile.email), 5000);
    return () => clearInterval(interval);
  }, [profile]);

  return (
    <div className="space-y-4 md:space-y-6 font-sans">
      <div>
        <h1 className="text-lg md:text-2xl font-bold text-slate-900">Shift Tracker</h1>
        <p className="text-xs md:text-sm text-slate-500">
          Real clock-in / clock-out history, sourced directly from your synced shift records — no simulated data.
        </p>
      </div>

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
                Shift start/end for USA warehouse staff is fully automatic and based on your device's real GPS location relative to your assigned warehouse. Manage and view live geofence status from the Dashboard page.
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
                        ? `App Connected${heartbeat?.deviceLabel ? ` — ${heartbeat.deviceLabel}` : ''}`
                        : heartbeatCheckedOnce ? 'App Not Connected' : 'Checking connection…'}
                    </p>
                    {heartbeat?.lastSeenAt && (
                      <p className="text-[9px] text-slate-400 font-semibold">Last check-in: {formatTimeNY(heartbeat.lastSeenAt)}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleReconnectCheck}
                  disabled={heartbeatChecking}
                  className="text-[9px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 px-2 py-1.5 rounded-md flex items-center gap-1 active:scale-97 transition-colors transition-transform shrink-0"
                >
                  <RefreshCw className={`h-3 w-3 ${heartbeatChecking ? 'animate-spin' : ''}`} /> Reconnect
                </button>
              </div>
              {heartbeatCheckedOnce && !hrActions.isHeartbeatLive(heartbeat) && (
                <p className="text-[9px] text-slate-400 leading-relaxed -mt-1">
                  If you&apos;ve installed the app, make sure it&apos;s running (check your system tray / menu bar), then click Reconnect. If you haven&apos;t installed it yet, use the button below.
                </p>
              )}

              {trackingSettings?.agentToken ? (
                <>
                  {/* Update-required banner — shown when the connected agent is
                      running an older build than TRACKER_MIN_VERSION. Employees
                      whose agent predates v6 (no agentVersion in heartbeat)
                      are silently ignored — the download buttons below always
                      point to /releases/latest so they'll get the right build. */}
                  {hrActions.isHeartbeatLive(heartbeat) && needsTrackerUpdate(heartbeat?.agentVersion) && (
                    <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-xl px-3.5 py-3">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-[11px] font-bold text-amber-900">Tracker Update Required — v{TRACKER_MIN_VERSION}</p>
                        <p className="text-[10px] text-amber-700 leading-relaxed">
                          You're running v{heartbeat?.agentVersion ?? 'unknown'}. Download the latest installer below, run it, and your tracker will reconnect automatically.
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
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="font-bold text-slate-500 bg-slate-50 uppercase tracking-widest border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3.5">Date</th>
                      <th className="px-5 py-3.5">Clock In</th>
                      <th className="px-5 py-3.5">Clock Out</th>
                      <th className="px-5 py-3.5 text-right">Duration</th>
                      <th className="px-5 py-3.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {timesheetEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-100/30 transition-colors">
                        <td className="px-5 py-4 font-bold text-slate-800">{localShiftDate(entry.clockIn, entry.date)}</td>
                        <td className="px-5 py-4 text-slate-600 font-medium font-mono">{formatTimeNY(entry.clockIn)}</td>
                        <td className="px-5 py-4 text-slate-600 font-medium font-mono">{entry.clockOut ? formatTimeNY(entry.clockOut) : '—'}</td>
                        <td className="px-5 py-4 text-right font-bold text-slate-900">{entry.duration || '—'}</td>
                        <td className="px-5 py-4 text-right">
                          <Badge variant={entry.status === 'in_progress' ? 'warning' : 'success'}>
                            {entry.status === 'in_progress' ? 'On Shift' : 'Completed'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {timesheetEntries.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400 font-semibold italic">No shifts recorded yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
                  <p className="py-6 text-center text-slate-400 font-semibold italic text-xs">No shifts recorded yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
