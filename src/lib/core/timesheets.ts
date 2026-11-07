// Plain TypeScript — no React, no 'use client', no PocketBase client. Safe to
// import from the browser, Next route handlers and the Edge runtime alike.
// Anything time-dependent takes an injectable `now` so it is unit-testable.
import type { TimesheetEntry, TrackerHeartbeat, CaptureHealthStatus, ShiftTabHeartbeat } from '../hr/types';

// longer matches any row in hr_tracking_settings — i.e. HR/Admin (or the
// employee) regenerated the setup code, but this specific already-running
// desktop agent hasn't been given the new code yet. Keep this in sync with
// the literal string in agent_gui.py's get_tracking_settings()/settings-poll
// loop if that message ever changes.
const STALE_TOKEN_ERROR_MARKER = 'Setup token not recognized';

// True when a heartbeat's own error field says the agent can't find its
// settings row anymore — added 2026-08-19 after zara@delcargo.us and
// alex@delcargo.us silently stopped capturing for over an hour with
// hr_tracking_settings.enabled genuinely true the whole time: someone had
// regenerated their setup codes (agentToken) to fix an earlier issue, but
// their already-running desktop agents kept authenticating with the OLD
// token, which no longer matched anything, so get_tracking_settings()
// returned null and the agent silently reported captureEnabled: false with
// this specific error — indistinguishable from "not on shift" unless this
// exact error string is checked for. Exported so both the Start Shift gate
// (employee/page.tsx) and getCaptureHealth below can use the same check.
export function hasStaleTrackerToken(hb: TrackerHeartbeat | null): boolean {
  return !!hb && hb.captureEnabled === false && (hb.lastCaptureError || '').includes(STALE_TOKEN_ERROR_MARKER);
}

/**
 * Classifies whether a live tracker heartbeat is actually producing usable
 * screenshots, distinct from isHeartbeatLive (which only proves the agent
 * process is running and can reach the server). Call this ONLY when
 * isHeartbeatLive(hb, ...) is already true and captureEnabled is expected
 * (i.e. the employee has an active shift) — otherwise every offline/no-
 * shift employee would show as "failing" for no reason.
 *
 * - 'idle'        — agent connected but not currently supposed to be
 *                    capturing (no active shift, or HR has tracking off).
 * - 'locked'      — agent detected the OS session was locked on its last tick.
 * - 'stale_token' — agent's setup code was regenerated but this device
 *                    hasn't been reconnected with the new one yet (see
 *                    hasStaleTrackerToken above). Checked BEFORE the
 *                    generic captureEnabled===false→'idle' case below,
 *                    since otherwise this looked identical to "not on
 *                    shift" and silently hid a real problem from HR.
 * - 'failing'     — 3+ consecutive capture/upload failures (not lock- or
 *                    token-related — e.g. permission revoked, disk full,
 *                    a genuine screen-grab/OS API error, persistent network
 *                    error).
 * - 'ok'          — capturing normally.
 * - 'unknown'     — pre-v14 agent build, no capture-health fields reported yet.
 */
export function getCaptureHealth(hb: TrackerHeartbeat | null): { status: CaptureHealthStatus; detail?: string } {
  if (!hb) return { status: 'unknown' };
  if (hb.isLocked) return { status: 'locked', detail: hb.lastCaptureError || 'Screen is locked' };
  if (hasStaleTrackerToken(hb)) return { status: 'stale_token', detail: hb.lastCaptureError || undefined };
  if (hb.captureEnabled === false) return { status: 'idle' };
  if (hb.captureEnabled === undefined) return { status: 'unknown' };
  if ((hb.consecutiveCaptureFailures ?? 0) >= 3) {
    return { status: 'failing', detail: hb.lastCaptureError || 'Screenshot capture is failing' };
  }
  return { status: 'ok' };
}
/**
 * "Is someone on shift with nothing being captured?" — the alert HR needed when an employee's
 * tracking setting was switched off in the middle of a shift and ~4 hours of work went
 * uncaptured with no warning anywhere.
 *
 * - 'tracking_off'  — on shift, but tracking is OFF for them, so no screenshots are being taken.
 * - 'no_captures'   — on shift, tracking ON, tracker connected, but no capture for longer than
 *                     two intervals (+ grace): e.g. permission revoked, tracker stuck.
 * - 'none'          — nothing to flag (not on shift, or capturing normally, or the tracker
 *                     is simply offline, which has its own "Offline/Disconnected" badge).
 *
 * `lastCaptureAt` older than the shift's own start is ignored (a capture from yesterday must
 * not count for today's shift), and a shift younger than the allowed gap is never flagged.
 */
export function getCaptureGap(args: {
  onShift: boolean;
  trackingOn: boolean;
  heartbeatLive: boolean;
  lastCaptureAt?: string | null;
  shiftStartedAt?: string | null;
  intervalMinutes: number;
  now?: number;
  graceMinutes?: number;
  /** False when this tracker never reports capture times (the Chromebook extension): then silence proves nothing. Default true. */
  captureReported?: boolean;
}): { status: 'none' | 'tracking_off' | 'no_captures'; minutes?: number } {
  const { onShift, trackingOn, heartbeatLive, intervalMinutes } = args;
  if (!onShift) return { status: 'none' };
  if (!trackingOn) return { status: 'tracking_off' };
  if (!heartbeatLive) return { status: 'none' };
  if (args.captureReported === false) return { status: 'none' };
  const now = args.now ?? Date.now();
  const allowedMs = (Math.max(1, intervalMinutes) * 2 + (args.graceMinutes ?? 5)) * 60 * 1000;
  const startedMs = args.shiftStartedAt ? new Date(args.shiftStartedAt).getTime() : NaN;
  if (!isNaN(startedMs) && now - startedMs < allowedMs) return { status: 'none' };
  const capturedMs = args.lastCaptureAt ? new Date(args.lastCaptureAt).getTime() : NaN;
  const reference = !isNaN(capturedMs) && (isNaN(startedMs) || capturedMs >= startedMs) ? capturedMs : startedMs;
  if (isNaN(reference)) return { status: 'none' };
  if (now - reference > allowedMs) return { status: 'no_captures', minutes: Math.round((now - reference) / 60000) };
  return { status: 'none' };
}

export const TRACKER_HEARTBEAT_STALE_MS = 3 * 60 * 1000;

// A short-lived "this browser tab is actively viewing an in-progress manual
// shift" heartbeat (Employee dashboard, non-USA/manual Start-Shift flow
// only — USA employees are governed by GPS geofencing instead, which has
// its own foreground/background lifecycle). Refreshed every ~20s while a
// manual shift is active. Lets the app tell a genuinely still-running
// shift apart from "the tab was closed N days/weeks ago and the shift just
// never got told to stop" — see closeStaleManualShiftIfAbandoned below, the
// safety net for when the pagehide-based immediate stop (best-effort —
// unload-style handlers never fire on a crash, force-quit, or killed
// process) never got the chance to run.
// Was 2 minutes — too tight. On the native mobile app, simply locking the
// phone or switching apps for a couple of minutes (extremely normal during
// a shift) let this go stale, which closeStaleManualShiftIfAbandoned then
// read as "the app was closed" and auto-ended the shift — reported by
// employees as being randomly logged out / shift-ended mid-shift with a
// "closed the app" push notification, even though they hadn't closed
// anything. 15 minutes gives real backgrounding room to breathe while still
// catching a genuinely abandoned/crashed session within a reasonable
// window. See also the pagehide-handler native/web split below, the other
// half of this same fix.
export const SHIFT_TAB_HEARTBEAT_STALE_MS = 15 * 60 * 1000;

// Grace period before auto-clock-out when heartbeat dies but no quit intent
// signal is present. Protects active shifts from transient server timeouts
// (screenshot uploads blocking heartbeat writes). After 15 min continuously
// dead with no quit signal, the shift is treated as a crash and ended.
export const TRACKER_HEARTBEAT_GRACE_MS = 15 * 60 * 1000;

// True when a tracker has written a heartbeat recently enough to be considered running. The window is fixed, not tied to the screenshot
// interval: the Windows/Mac tracker reports about once a minute (up to every two minutes while retrying) and the Chromebook extension every
// 15 seconds, whatever interval HR chose. 13 minutes absorbs slow uploads and short network drops; the server's auto-close hook uses the same window.
export function isHeartbeatLive(hb: TrackerHeartbeat | null, now: number = Date.now()): boolean {
  if (!hb?.lastSeenAt) return false;
  return (now - new Date(hb.lastSeenAt).getTime()) < TRACKER_HEARTBEAT_LIVE_DEFAULT_MS;
}

export function isShiftTabHeartbeatLive(hb: ShiftTabHeartbeat | null, now: number = Date.now()): boolean {
  return !!hb?.lastSeenAt && (now - new Date(hb.lastSeenAt).getTime()) < SHIFT_TAB_HEARTBEAT_STALE_MS;
}

// The auto-close windows. pb_hooks/auto_close_stale_shifts.pb.js runs the same rules on the server and cannot import this file, so it repeats
// these numbers; src/lib/pbHookConstants.test.ts fails if the two ever differ.
export const ORPHAN_SHIFT_GRACE_MS = 30 * 60 * 1000; // a tracked shift is orphaned when its tracker was last seen this long ago
export const MIN_SHIFT_AGE_MS = 45 * 60 * 1000; // and only once the shift is at least this old (a brief sleep or wifi blip must not close it)
export const MAX_SHIFT_DURATION_MS = 16 * 60 * 60 * 1000; // no legitimate single shift runs longer than this
/** How long a tracker heartbeat counts as live: 13 minutes, the same window the server hook uses. */
export const TRACKER_HEARTBEAT_LIVE_DEFAULT_MS = (3 + 10) * 60 * 1000;

/** A shift's length in minutes, rounded the same way the saved "Xh Ym" text is, so reports, the absence page and the saved text agree. (Payroll uses elapsedMinutes below, which rounds down, for its hour rules.) */
export function shiftMinutes(clockIn: string | undefined | null, clockOut: string | undefined | null, openShiftEndMs?: number): number {
  if (!clockIn) return 0;
  const start = new Date(clockIn).getTime();
  const end = clockOut ? new Date(clockOut).getTime() : openShiftEndMs ?? start;
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 60000)) : 0;
}

// Whole minutes between a shift's clock-in and clock-out. An open shift
// (no clockOut) counts as 0 unless `openShiftEndMs` is given, in which case
// it runs up to that instant. Unparseable / non-positive spans are 0.
export function elapsedMinutes(clockIn: string | undefined | null, clockOut: string | undefined | null, openShiftEndMs?: number): number {
  if (!clockIn) return 0;
  const inTime = new Date(clockIn).getTime();
  const outTime = clockOut ? new Date(clockOut).getTime() : openShiftEndMs;
  if (isNaN(inTime) || outTime === undefined || isNaN(outTime) || outTime <= inTime) return 0;
  return Math.floor((outTime - inTime) / 60000);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw PocketBase row
export function toTimesheet(t: any): TimesheetEntry {
  const clockOut = t.clock_out || undefined;
  return {
    id: t.id, employeeEmail: t.employee_id, date: t.date, clockIn: t.clock_in, clockOut,
    duration: t.duration || undefined,
    status: clockOut ? 'completed' : 'in_progress',
    approvalStatus: t.status || 'pending',
  };
}
