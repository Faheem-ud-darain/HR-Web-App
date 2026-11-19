'use client';

import { ShiftStatusIcon } from '@/components/ui/ShiftStatusIcon';
import React from 'react';
import type { RefetchOptions, QueryObserverResult } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/Card';
import { CrosshairIcon as LocateFixed, DeviceMobileIcon as Smartphone, WifiHighIcon as Wifi, WifiSlashIcon as WifiOff } from '@/components/ui/icons';
import { hrActions, TrackerHeartbeat, localShiftDate, Profile, TimesheetEntry } from '@/lib/hrData';
import { isMobileDevice } from '@/lib/trackerSetup';
import { shiftStartBlock, type StartBlock } from '@/lib/core/shiftStart';
import { requiredDayMinutes } from '@/lib/core/workDay';
import { checkTracker, notifyShift, confirmedClockIn, confirmedClockOut } from '@/lib/hr/shiftActions';
import { Button } from '@/components/ui/Button';
import { Capacitor } from '@capacitor/core';
import { openLocationSettings } from '@/lib/backgroundGeolocation';
import type { GeoPermission } from '@/lib/useGeofenceShift';

interface ShiftControlCardProps {
  shiftActive: boolean;
  userProfile: Profile | null;
  geoPermission: GeoPermission;
  liveDistance: { meters: number; warehouseName: string; isInside: boolean; } | null;
  /** Why the last location was skipped (weak or old), shown instead of a silent wait. */
  gpsNote?: string;
  isTrackingLiveFor: (emp: Profile) => boolean;
  setPingingTracker: React.Dispatch<React.SetStateAction<boolean>>;
  setTrackerHeartbeat: React.Dispatch<React.SetStateAction<TrackerHeartbeat | null>>;
  /** Starting is not allowed right now, and why (the page shows the matching prompt). */
  onStartBlocked: (block: StartBlock) => void;
  /** The shift ended with less than the 8-hour day worked (a heads-up, never a gate). */
  onShortShift: (details: { workedMinutes: number; remainingMinutes: number; requiredMinutes: number }) => void;
  setShiftActive: React.Dispatch<React.SetStateAction<boolean>>;
  openShiftRef: React.RefObject<{ id: string; clockIn: string; } | null>;
  refetchTimesheets: (options?: RefetchOptions) => Promise<QueryObserverResult<TimesheetEntry[], Error>>;
  pingingTracker: boolean;
  allTimesheets: TimesheetEntry[] | undefined;
  geoErrorMsg: string;
  /** Turns automatic check-in on (asks the phone for location). */
  onEnableLocation: () => void;
  /** A second phone takes over attendance from the one that has it. */
  onUseThisDevice: () => void;
  trackerHeartbeat: TrackerHeartbeat | null;
  /** The person's shifts have loaded, so whether a shift is open is known. Until then neither Start nor End can be trusted. */
  shiftKnown: boolean;
  /** Loading the shifts failed (after retries). */
  shiftLoadFailed: boolean;
  onRetryShift: () => void;
}

export function ShiftControlCard({ shiftActive, userProfile, geoPermission, liveDistance, gpsNote, isTrackingLiveFor, setPingingTracker, setTrackerHeartbeat, onStartBlocked, onShortShift, setShiftActive, openShiftRef, refetchTimesheets, pingingTracker, allTimesheets, geoErrorMsg, onEnableLocation, onUseThisDevice, trackerHeartbeat, shiftKnown, shiftLoadFailed, onRetryShift }: ShiftControlCardProps) {
  const [actionError, setActionError] = React.useState('');
  const busyRef = React.useRef(false);
  // Manual Start Shift is never allowed from a phone or tablet, tracked account or not (see isMobileDevice in trackerSetup.ts).
  const isMobileApp = isMobileDevice();
  return (
    <Card className={`border-2 transition-colors ${shiftActive ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-white'}`}>
      <CardContent className="p-4 md:p-5">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <ShiftStatusIcon active={shiftActive} gps={userProfile?.region === 'USA'} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className={`font-display font-bold text-lg tracking-tight ${shiftActive ? 'text-emerald-700' : 'text-slate-700'}`}>
                  {shiftActive ? 'On Shift' : 'Off Shift'}
                </p>
              </div>
              <p className="text-xs text-slate-500 font-semibold mt-0.5 truncate">
                {userProfile?.region === 'USA'
                  ? (geoPermission === 'unsupported' || geoPermission === 'denied' || geoPermission === 'desktop' || geoPermission === 'android' || geoPermission === 'other_device'
                      ? 'Automatic GPS check-in is not running on this device — see details below'
                      : gpsNote
                        ? gpsNote
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
            <div className="shrink-0 text-caption font-bold text-slate-400 uppercase tracking-wider px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-1.5">
              <LocateFixed className="h-3.5 w-3.5" /> Auto Geofencing
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <div className="flex gap-2">
                <Button variant="success" size="lg"
                  onClick={async () => {
                    if (!userProfile?.email || busyRef.current) return;
                    busyRef.current = true; // one start or end at a time: a second tap, or a slow reply followed by another tap, can never run twice
                    setActionError('');
                    try {
                      // May this person start right now? (rules: shiftStartBlock in core/shiftStart.ts). A tracked employee's
                      // desktop tracker is checked live first (checkTracker): it must answer, or have a live heartbeat.
                      const tracked = !isMobileApp && isTrackingLiveFor(userProfile);
                      let tracker = { trackerReplied: false, heartbeat: null as TrackerHeartbeat | null, heartbeatLive: false, heartbeatReadFailed: false };
                      if (tracked) {
                        setPingingTracker(true);
                        tracker = await checkTracker(userProfile.email);
                        setTrackerHeartbeat(tracker.heartbeat);
                      }
                      const block = shiftStartBlock({ mobile: isMobileApp, tracked, ...tracker });
                      if (block) {
                        onStartBlocked(block);
                        return;
                      }

                      // ── Clock In ────────────────────────────────────────────
                      // The screen says "On Shift" only once the server has confirmed it. If it cannot be confirmed the person is told so
                      // and can press Start again: starting twice is safe (an already-open shift is returned, not duplicated).
                      let started;
                      try {
                        started = await confirmedClockIn(userProfile.email);
                      } catch {
                        setActionError("We couldn't confirm your shift started. Check your connection and press Start Shift again. It will not start twice.");
                        return;
                      }
                      setShiftActive(true);
                      openShiftRef.current = { id: started.id, clockIn: started.clockIn };
                      // The shift IS started: everything after this is best-effort and must never make it look like it failed.
                      try {
                        await hrActions.touchShiftTabHeartbeat(userProfile.email);
                        await refetchTimesheets();
                        await notifyShift(userProfile, 'Shift started manually. Screen tracking is now active for this shift.', name => `${name} started shift manually.`);
                      } catch { /* the shift is recorded; the next refresh and the heartbeat catch up */ }
                    } finally {
                      setPingingTracker(false);
                      busyRef.current = false;
                    }
                  }}
                  disabled={
                    shiftActive ||
                    pingingTracker ||
                    isMobileApp ||
                    !shiftKnown // never offer Start before we know whether a shift is already open (a second one must not be started)
                    // Heartbeat-dead no longer disables the button — the ping/pong
                    // handshake in onClick is the authoritative live check now.
                  }
                >
                  {pingingTracker ? 'Connecting to tracker…' : 'Start Shift'}
                </Button>
                <Button variant="danger" size="lg"
                  onClick={async () => {
                    if (!userProfile?.email || busyRef.current) return;
                    busyRef.current = true;
                    setActionError('');
                    try {
                      // IMPORTANT: End Shift must ALWAYS write clock_out immediately, no matter how many hours were worked. (It once sat
                      // behind an "Under 8 Hours" confirmation; employees who missed it left shifts open until the 16-hour cap. The
                      // under-8-hour modal is purely informational and shown after the fact.)
                      //
                      // The screen says "Off Shift" only once the server has confirmed the end. Before, it flipped first and never went
                      // back, so a timed-out request left the shift open and paid with the End button disabled and no message.
                      const todayStr = localShiftDate(new Date().toISOString());
                      const myTodayShifts = (allTimesheets || []).filter(t =>
                        t.employeeEmail.toLowerCase() === userProfile.email.toLowerCase() &&
                        localShiftDate(t.clockIn, t.date) === todayStr
                      );
                      let totalWorkedMs = 0;
                      const nowMs = Date.now();
                      for (const shift of myTodayShifts) {
                        const startMs = new Date(shift.clockIn).getTime();
                        const endMs = shift.clockOut ? new Date(shift.clockOut).getTime() : nowMs;
                        totalWorkedMs += Math.max(0, endMs - startMs);
                      }
                      const totalWorkedMins = Math.floor(totalWorkedMs / 60000);

                      try {
                        await confirmedClockOut(userProfile.email);
                      } catch {
                        setActionError("We couldn't confirm your shift ended, so it is still running. Check your connection and press End Shift again.");
                        return;
                      }
                      setShiftActive(false);
                      openShiftRef.current = null;
                      try {
                        await refetchTimesheets();
                        await notifyShift(userProfile, 'Shift ended manually. Screen tracking has stopped.', name => `${name} ended shift manually.`);
                      } catch { /* the shift is ended; the next refresh catches up */ }

                      const requiredMinutes = requiredDayMinutes(userProfile);
                      if (totalWorkedMins < requiredMinutes) {
                        onShortShift({ workedMinutes: totalWorkedMins, remainingMinutes: requiredMinutes - totalWorkedMins, requiredMinutes });
                      }
                    } finally {
                      busyRef.current = false;
                    }
                  }}
                  disabled={!shiftActive}
                >
                  End Shift
                </Button>
              </div>
              {!shiftKnown && (
                <p className="text-caption font-semibold text-amber-700 text-right">
                  {shiftLoadFailed ? "Couldn't load your shift. " : 'Checking your shift… '}
                  {shiftLoadFailed && <button type="button" className="underline" onClick={onRetryShift}>Try again</button>}
                </p>
              )}
              {actionError && <p role="alert" className="max-w-xs text-caption font-semibold text-rose-700 text-right">{actionError}</p>}
            </div>
          )}
        </div>
    
        {/* Diagnostic / secondary detail — tucked below the primary
            status+action row instead of competing with it for attention.
            This is exactly the stuff that used to be the WHOLE widget. */}
        {userProfile?.region === 'USA' ? (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-1.5">
            {(!userProfile.assignedWarehouses || userProfile.assignedWarehouses.length === 0) ? (
              <p className="text-caption text-slate-400 italic">No warehouses assigned by HR yet — geofenced check-in will activate once a warehouse is assigned to your profile.</p>
            ) : geoPermission === 'unsupported' ? (
              <p className="text-caption text-rose-600 font-semibold leading-relaxed">Your browser/device does not support GPS location. Automatic geofenced check-in is unavailable here — please use a modern mobile or desktop browser.</p>
            ) : geoPermission === 'android' ? (
              <p className="text-caption text-slate-500 font-semibold leading-relaxed">Automatic attendance is available on iPhone for now. Android is coming soon. Please use an iPhone, or ask HR.</p>
            ) : geoPermission === 'desktop' ? (
              <p className="text-caption text-slate-500 font-semibold leading-relaxed">Attendance is marked from your phone. Open the Delcargo app on your phone at the warehouse; this screen only shows your shift.</p>
            ) : geoPermission === 'other_device' ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-caption text-amber-700 font-semibold leading-relaxed">{geoErrorMsg}</p>
                <Button variant="primary" size="sm" onClick={onUseThisDevice} className="shrink-0">Use this device</Button>
              </div>
            ) : geoPermission === 'declined' ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-caption text-amber-700 font-semibold leading-relaxed">Automatic check-in is off, so your shift will not start or end by itself.</p>
                <Button variant="primary" size="sm" onClick={onEnableLocation} className="shrink-0">Turn on</Button>
              </div>
            ) : geoPermission === 'denied' ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-caption text-rose-700 font-semibold leading-relaxed">{geoErrorMsg}</p>
                <Button variant="danger" size="sm" onClick={() => { void openLocationSettings().then(opened => { if (!opened) window.location.reload(); }); }} className="shrink-0">
                  {Capacitor.isNativePlatform() ? 'Open Settings' : 'Retry'}
                </Button>
              </div>
            ) : (
              <p className="text-caption text-slate-400 leading-relaxed">Your shift starts and ends automatically as you enter or leave an assigned warehouse&apos;s geofence — no manual check-in needed.</p>
            )}
          </div>
        ) : (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            {userProfile && isMobileApp && !shiftActive && (
              <div className="flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-caption font-bold bg-rose-50 border-rose-200 text-rose-700">
                <Smartphone className="h-3.5 w-3.5 shrink-0" />
                Shifts can only be started from a desktop/laptop browser — manual Start Shift is not available on a mobile device.
              </div>
            )}
            {userProfile && isTrackingLiveFor(userProfile) && !isMobileApp && !shiftActive && (
              <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-caption font-bold ${hrActions.isHeartbeatLive(trackerHeartbeat) ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                {hrActions.isHeartbeatLive(trackerHeartbeat) ? <Wifi className="h-3.5 w-3.5 shrink-0" /> : <WifiOff className="h-3.5 w-3.5 shrink-0" />}
                {hrActions.isHeartbeatLive(trackerHeartbeat)
                  ? 'Tracker app connected — you can start your shift.'
                  : 'Tracker app not detected in recent check. Make sure it\'s running — we\'ll verify live before starting your shift.'}
              </div>
            )}
            <p className="text-caption text-slate-400 leading-relaxed">
              If your account has screen tracking configured by HR/Admin, starting a shift activates it for the duration of your shift; ending your shift turns it off.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
