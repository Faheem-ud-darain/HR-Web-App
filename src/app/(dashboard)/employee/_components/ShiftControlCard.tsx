'use client';

import { StatusDot } from '@/components/ui/StatusDot';
import React from 'react';
import type { RefetchOptions, QueryObserverResult } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/Card';
import { FlagIcon as Flag, CrosshairIcon as LocateFixed, DeviceMobileIcon as Smartphone, WifiHighIcon as Wifi, WifiSlashIcon as WifiOff } from '@/components/ui/icons';
import { hrActions, TrackerHeartbeat, localShiftDate, Profile, TimesheetEntry } from '@/lib/hrData';
import { isMobileDevice } from '@/lib/trackerSetup';
import { shiftStartBlock, type StartBlock } from '@/lib/core/shiftStart';
import { checkTracker, notifyShift } from '@/lib/hr/shiftActions';
import { Button } from '@/components/ui/Button';

interface ShiftControlCardProps {
  shiftActive: boolean;
  userProfile: Profile | null;
  geoPermission: "idle" | "requesting" | "granted" | "denied" | "unsupported";
  liveDistance: { meters: number; warehouseName: string; isInside: boolean; } | null;
  isTrackingLiveFor: (emp: Profile) => boolean;
  setPingingTracker: React.Dispatch<React.SetStateAction<boolean>>;
  setTrackerHeartbeat: React.Dispatch<React.SetStateAction<TrackerHeartbeat | null>>;
  /** Starting is not allowed right now, and why (the page shows the matching prompt). */
  onStartBlocked: (block: StartBlock) => void;
  /** The shift ended with less than the 8-hour day worked (a heads-up, never a gate). */
  onUnderEight: (details: { workedMinutes: number; remainingMinutes: number }) => void;
  setShiftActive: React.Dispatch<React.SetStateAction<boolean>>;
  openShiftRef: React.RefObject<{ id: string; clockIn: string; } | null>;
  refetchTimesheets: (options?: RefetchOptions) => Promise<QueryObserverResult<TimesheetEntry[], Error>>;
  pingingTracker: boolean;
  allTimesheets: TimesheetEntry[] | undefined;
  geoErrorMsg: string;
  trackerHeartbeat: TrackerHeartbeat | null;
}

export function ShiftControlCard({ shiftActive, userProfile, geoPermission, liveDistance, isTrackingLiveFor, setPingingTracker, setTrackerHeartbeat, onStartBlocked, onUnderEight, setShiftActive, openShiftRef, refetchTimesheets, pingingTracker, allTimesheets, geoErrorMsg, trackerHeartbeat }: ShiftControlCardProps) {
  // Manual Start Shift is never allowed from a phone or tablet, tracked account or not (see isMobileDevice in trackerSetup.ts).
  const isMobileApp = isMobileDevice();
  return (
    <Card className={`border-2 transition-colors ${shiftActive ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-white'}`}>
      <CardContent className="p-4 md:p-5">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${shiftActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
              <Flag className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <StatusDot tone={shiftActive ? 'emerald' : 'slate'} size="sm" pulse={shiftActive} />
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
            <div className="shrink-0 text-caption font-bold text-slate-400 uppercase tracking-wider px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-1.5">
              <LocateFixed className="h-3.5 w-3.5" /> Auto Geofencing
            </div>
          ) : (
            <div className="flex gap-2 shrink-0">
              <Button variant="success" size="lg"
                onClick={async () => {
                  if (!userProfile?.email) return;
    
                  // Wrapped in try/finally so pingingTracker/checkingTracker
                  // can never get stuck showing "Connecting to tracker…" /
                  // "Checking tracker…" forever if anything below throws
                  // unexpectedly (network blip, a rejected promise, etc.) —
                  // previously an uncaught error here left the button
                  // permanently disabled until the page was reloaded.
                  try {
                    // May this person start right now? (rules: shiftStartBlock in core/shiftStart.ts). A tracked employee's
                    // desktop tracker is checked live first (checkTracker): it must answer, or have a live heartbeat.
                    const tracked = !isMobileApp && isTrackingLiveFor(userProfile);
                    let tracker = { trackerReplied: false, heartbeat: null as TrackerHeartbeat | null, heartbeatLive: false };
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
                    setShiftActive(true);
                    const started = await hrActions.clockIn(userProfile.email);
                    openShiftRef.current = { id: started.id, clockIn: started.clockIn };
                    await hrActions.touchShiftTabHeartbeat(userProfile.email);
                    await refetchTimesheets();
                    await notifyShift(userProfile, 'Shift started manually. Screen tracking is now active for this shift.', name => `${name} started shift manually.`);
                  } finally {
                    setPingingTracker(false);
                  }
                }}
                disabled={
                  shiftActive ||
                  pingingTracker ||
                  isMobileApp
                  // Heartbeat-dead no longer disables the button — the ping/pong
                  // handshake in onClick is the authoritative live check now.
                }
              >
                {pingingTracker ? 'Connecting to tracker…' : 'Start Shift'}
              </Button>
              <Button variant="danger" size="lg"
                onClick={async () => {
                  if (!userProfile?.email) return;
    
                  // IMPORTANT: End Shift must ALWAYS write clock_out
                  // immediately, no matter how many hours were worked.
                  // This used to gate the actual clockOut() call behind
                  // an "Under 8 Hours" confirmation modal — if the
                  // employee didn't notice/click through that second
                  // step (its "Keep Shift Running" button was the more
                  // prominent green one), the shift silently stayed open
                  // in hr_timesheets with clock_out still empty, closing
                  // the tracker app didn't help either (the tracker-stop
                  // signal only fires inside clockOut()), and the shift
                  // just sat open until the 16-hour hard-cap cron
                  // eventually caught it. Fixed 2026-09-01: the click
                  // always ends the shift now; the under-8-hour modal is
                  // now purely informational (shown after the fact), not
                  // a gate.
                  const doClockOut = async () => {
                    setShiftActive(false);
                    openShiftRef.current = null;
                    await hrActions.clockOut(userProfile.email);
                    await refetchTimesheets();
                    await notifyShift(userProfile, 'Shift ended manually. Screen tracking has stopped.', name => `${name} ended shift manually.`);
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
    
                  // End the shift first — always — then, separately,
                  // surface the under-8-hour heads-up as a plain
                  // informational modal if it applies. The shift is never
                  // left open waiting on this.
                  await doClockOut();
    
                  if (totalWorkedMins < REQUIRED_SHIFT_MINUTES) {
                    onUnderEight({ workedMinutes: totalWorkedMins, remainingMinutes: REQUIRED_SHIFT_MINUTES - totalWorkedMins });
                  }
                }}
                disabled={!shiftActive}
              >
                End Shift
              </Button>
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
            ) : geoPermission === 'denied' ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-caption text-rose-700 font-semibold leading-relaxed">{geoErrorMsg}</p>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => window.location.reload()}
                  className="shrink-0"
                >
                  Retry
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
