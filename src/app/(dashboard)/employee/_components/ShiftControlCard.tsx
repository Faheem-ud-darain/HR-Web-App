'use client';

import { StatusDot } from '@/components/ui/StatusDot';
import React from 'react';
import type { RefetchOptions, QueryObserverResult } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/Card';
import { Flag, LocateFixed, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { hrActions, TrackerHeartbeat, hasStaleTrackerToken, displayName, localShiftDate, Profile, TimesheetEntry } from '@/lib/hrData';
import { needsTrackerUpdate } from '@/lib/trackerSetup';
import { Button } from '@/components/ui/Button';

interface ShiftControlCardProps {
  shiftActive: boolean;
  userProfile: Profile | null;
  geoPermission: "idle" | "requesting" | "granted" | "denied" | "unsupported";
  liveDistance: { meters: number; warehouseName: string; isInside: boolean; } | null;
  isMobileApp: boolean;
  setShowMobileBlockedModal: React.Dispatch<React.SetStateAction<boolean>>;
  isTrackingLiveFor: (emp: Profile) => boolean;
  setPingingTracker: React.Dispatch<React.SetStateAction<boolean>>;
  setTrackerHeartbeat: React.Dispatch<React.SetStateAction<TrackerHeartbeat | null>>;
  setShowTrackerRequiredModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTrackerUpdateRequiredModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTrackerReconnectRequiredModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShiftActive: React.Dispatch<React.SetStateAction<boolean>>;
  setGeofenceStatus: React.Dispatch<React.SetStateAction<string>>;
  openShiftRef: React.RefObject<{ id: string; clockIn: string; } | null>;
  refetchTimesheets: (options?: RefetchOptions) => Promise<QueryObserverResult<TimesheetEntry[], Error>>;
  setCheckingTracker: React.Dispatch<React.SetStateAction<boolean>>;
  checkingTracker: boolean;
  pingingTracker: boolean;
  allTimesheets: TimesheetEntry[] | undefined;
  setUnder8HourDetails: React.Dispatch<React.SetStateAction<{ workedMinutes: number; remainingMinutes: number; } | null>>;
  setShowUnder8HourModal: React.Dispatch<React.SetStateAction<boolean>>;
  geoErrorMsg: string;
  trackerHeartbeat: TrackerHeartbeat | null;
}

export function ShiftControlCard({ shiftActive, userProfile, geoPermission, liveDistance, isMobileApp, setShowMobileBlockedModal, isTrackingLiveFor, setPingingTracker, setTrackerHeartbeat, setShowTrackerRequiredModal, setShowTrackerUpdateRequiredModal, setShowTrackerReconnectRequiredModal, setShiftActive, setGeofenceStatus, openShiftRef, refetchTimesheets, setCheckingTracker, checkingTracker, pingingTracker, allTimesheets, setUnder8HourDetails, setShowUnder8HourModal, geoErrorMsg, trackerHeartbeat }: ShiftControlCardProps) {
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
            <div className="shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-1.5">
              <LocateFixed className="h-3.5 w-3.5" /> Auto Geofencing
            </div>
          ) : (
            <div className="flex gap-2 shrink-0">
              <button
                onClick={async () => {
                  if (!userProfile?.email) return;
    
                  // Wrapped in try/finally so pingingTracker/checkingTracker
                  // can never get stuck showing "Connecting to tracker…" /
                  // "Checking tracker…" forever if anything below throws
                  // unexpectedly (network blip, a rejected promise, etc.) —
                  // previously an uncaught error here left the button
                  // permanently disabled until the page was reloaded.
                  try {
                    // Mobile block — manual Start Shift is never allowed
                    // from a mobile device, tracked account or not (see
                    // isMobileDevice's comment in trackerSetup.ts).
                    if (isMobileApp) {
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
                      let pongReceived = false;
    
                      try {
                        // Clean up any stale pong from a previous attempt
                        await hrActions.clearTrackerPong(userProfile.email);
                        await hrActions.writeTrackerPing(userProfile.email, requestId);
    
                        // Poll for pong every 500ms, give up after 8 seconds.
                        //
                        // BUGFIX 2026-09-08: this used to track "elapsed"
                        // by just adding POLL_MS every iteration, which
                        // assumes getTrackerPong() always resolves
                        // instantly. It doesn't have a timeout of its own
                        // (see hrData.ts), so on a slow/stalled connection
                        // a single attempt could take far longer than
                        // 500ms while this loop's bookkeeping still only
                        // counted 500ms against the 8s budget — the real
                        // wall-clock wait could stretch on far past the
                        // intended timeout (confirmed via analytics: up to
                        // 11+ minutes), leaving the button stuck showing
                        // "Connecting to tracker...". Now measured against
                        // Date.now() directly, so 8 seconds of REAL time is
                        // always the hard cap no matter how long any
                        // individual attempt takes (each attempt also now
                        // has its own 4s ceiling via withTimeout in
                        // hrData.ts, so at most one slow attempt can be
                        // in flight when the loop's own deadline hits).
                        const POLL_MS = 500;
                        const TIMEOUT_MS = 8000;
                        const deadline = Date.now() + TIMEOUT_MS;
                        while (Date.now() < deadline) {
                          await new Promise(r => setTimeout(r, POLL_MS));
                          try {
                            const pong = await hrActions.getTrackerPong(userProfile.email);
                            if (pong?.requestId === requestId) {
                              pongReceived = true;
                              break;
                            }
                          } catch { /* ignore poll errors, keep trying */ }
                        }
                      } catch {
                        // Couldn't even write the ping (server issue) — fall
                        // through to the heartbeat fallback below instead of
                        // blocking outright.
                      } finally {
                        // Clean up ping and pong keys regardless of outcome
                        hrActions.clearTrackerPing(userProfile.email).catch(() => {});
                        hrActions.clearTrackerPong(userProfile.email).catch(() => {});
                      }
    
                      let liveHb: TrackerHeartbeat | null = null;
                      if (!pongReceived) {
                        // Dual-Validation Rule: the ping/pong handshake
                        // failed or timed out (SSE not connected — e.g. a
                        // corporate firewall blocking it, or PocketBase
                        // momentarily busy uploading a screenshot). Rather
                        // than blocking Start Shift outright, fall back to
                        // checking whether the tracker has sent a live
                        // heartbeat recently — if so, it's plainly still
                        // running and this employee shouldn't be stuck.
                        const freshHb = await hrActions.getTrackerHeartbeat(userProfile.email).catch(() => null);
                        setTrackerHeartbeat(freshHb ?? null);
                        if (!hrActions.isHeartbeatLive(freshHb)) {
                          setShowTrackerRequiredModal(true);
                          return;
                        }
                        // Heartbeat is live — proceed even without a pong.
                        liveHb = freshHb;
                      } else {
                        // Pong confirmed the tracker is live, but pong alone
                        // doesn't carry agentVersion — fetch the heartbeat too
                        // so the version gate right below has something to
                        // check.
                        liveHb = await hrActions.getTrackerHeartbeat(userProfile.email).catch(() => null);
                        setTrackerHeartbeat(liveHb ?? null);
                      }
    
                      // Version gate — same TRACKER_MIN_VERSION check that
                      // shows HR/Admin an "Update Required" badge in
                      // TrackingView. A live tracker isn't enough on its
                      // own: an old-enough build can keep answering pings
                      // and heartbeats while producing nothing usable (no
                      // capture-health reporting, possibly no real capture
                      // at all — see PROJECT_HISTORY.md 1d). Block Start
                      // Shift here too so leaving that build's own update
                      // popup open and clicking Start Shift instead can't
                      // route around it.
                      if (needsTrackerUpdate(liveHb?.agentVersion, liveHb?.deviceLabel)) {
                        setShowTrackerUpdateRequiredModal(true);
                        return;
                      }
    
                      // Stale-setup-code gate — the agent is live and on a
                      // current build, but it's still presenting an
                      // agentToken that no longer matches any row in
                      // hr_tracking_settings (because the setup code was
                      // regenerated since it was last configured). Block
                      // here too, otherwise the shift starts against a
                      // tracker that will never actually capture anything.
                      if (hasStaleTrackerToken(liveHb)) {
                        setShowTrackerReconnectRequiredModal(true);
                        return;
                      }
                      // Tracker confirmed live and up to date — proceed
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
                  } finally {
                    setPingingTracker(false);
                    setCheckingTracker(false);
                  }
                }}
                disabled={
                  shiftActive ||
                  checkingTracker ||
                  pingingTracker ||
                  isMobileApp
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
    
                  // End the shift first — always — then, separately,
                  // surface the under-8-hour heads-up as a plain
                  // informational modal if it applies. The shift is never
                  // left open waiting on this.
                  await doClockOut();
    
                  if (totalWorkedMins < REQUIRED_SHIFT_MINUTES) {
                    setUnder8HourDetails({
                      workedMinutes: totalWorkedMins,
                      remainingMinutes: REQUIRED_SHIFT_MINUTES - totalWorkedMins,
                    });
                    setShowUnder8HourModal(true);
                  }
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
              <p className="text-[9px] text-slate-400 leading-relaxed">Your shift starts and ends automatically as you enter or leave an assigned warehouse&apos;s geofence — no manual check-in needed.</p>
            )}
          </div>
        ) : (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            {userProfile && isMobileApp && !shiftActive && (
              <div className="flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[10px] font-bold bg-rose-50 border-rose-200 text-rose-700">
                <Smartphone className="h-3 w-3 shrink-0" />
                Shifts can only be started from a desktop/laptop browser — manual Start Shift is not available on a mobile device.
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
  );
}
