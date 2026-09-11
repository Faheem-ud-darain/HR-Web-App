// src/lib/hr/timesheets.ts
// Clock in/out (hr_timesheets), the 5-Signal Tracker Reliability System,
// tracker heartbeat/capture-health helpers, tracking settings, and the
// manual-shift-tab abandoned-tab safety net. Extracted from the former
// hrData.ts monolith (plan 014). See plans/014-split-hrdata-monolith.md.

'use client';
import { useQuery } from '@tanstack/react-query';
import { formatDateNY, getNYDateString } from '../timezone';
import { pb } from '../pocketbase';
import type {
  Profile, TimesheetEntry, TrackerHeartbeat, CaptureHealthStatus, ShiftTabHeartbeat,
  ShiftStopSignal, TrackerQuitIntent, TrackerPing, TrackerPong,
  TrackerStopCommand, TrackerCommand, TrackerDiagnostics, TrackingSettings,
} from './types';
import {
  pbList, pbCreate, pbUpdate, pbDelete, pbUpsertByField, pbFindByField,
  pbGetKV, pbSetKV, pbGetKVByPrefix, pbDeleteKVByKeys, withTimeout,
  looksLikeRealId, formatDurationBetween,
} from './shared';
import { hrActions, displayName } from '../hrData';

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
const shiftTabHeartbeatKeyFor = (email: string) => `shift_tab_heartbeat_${(email || '').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

// One-shot "your shift was just auto-ended by the desktop tracker" signal
// (see notify_shift_auto_stopped in tracker-agent/agent_gui.py, written
// right after quitting the app auto-clocks someone out). The Employee
// dashboard polls for this so it can pop up an explanation immediately if
// it's open in a browser somewhere, on top of (not instead of) the existing
// shift_auto_stopped_<email> localStorage flag that already covers the
// "wasn't looking at the dashboard right now" case at next login.
const shiftStopSignalKeyFor = (email: string) => `shift_stop_signal_${(email || '').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

// ── 5-Signal Tracker Reliability System ─────────────────────────────────────
// All signals use hr_delcargo_store KV as the message bus. Key slug pattern
// matches heartbeat_key_for() in tracker-agent/agent_gui.py (email lowercased,
// non-alphanumeric chars replaced with '_').
const _slugify = (email: string) => (email || '').toLowerCase().replace(/[^a-z0-9]/g, '_');

// Signal 2: Written by tracker agent (with retry) on deliberate quit.
// Portal checks this to distinguish deliberate quit (clock out immediately)
// from a server blip (wait TRACKER_HEARTBEAT_GRACE_MS before acting).
const trackerQuitIntentKeyFor = (email: string) => `tracker_quit_intent_${_slugify(email)}`;

// Signal 3: Written by portal when employee clicks "Start Shift". The tracker
// agent reads this via realtime SSE on hr_delcargo_store and responds with Signal 4.
const trackerPingKeyFor = (email: string) => `tracker_ping_${_slugify(email)}`;

// Signal 4: Written by tracker agent in response to Signal 3.
// Portal polls for this with matching requestId, then proceeds with clock-in.
const trackerPongKeyFor = (email: string) => `tracker_pong_${_slugify(email)}`;

// Signal 5: Written by portal when employee clicks "End Shift" (via clockOut).
// Tracker agent reads this via realtime SSE and immediately stops capturing.
// Agent deletes this key after acting on it.
const trackerStopCmdKeyFor = (email: string) => `tracker_stop_cmd_${_slugify(email)}`;

// Signal 6: Written by HR/Admin from TrackingView (Run Diagnostics / Reload
// Settings Now buttons). Tracker agent reads this via the same realtime SSE
// subscription as ping/stop_cmd and deletes the key itself once acted on
// (see clear_command in agent_gui.py) — the portal never has to clean this
// one up. Added 2026-08-24 alongside Signal 7 below to give HR a direct
// remote-command channel instead of guessing what's wrong with a specific
// employee's tracker from stale heartbeat fields alone.
const trackerCommandKeyFor = (email: string) => `tracker_command_${_slugify(email)}`;

// Signal 7: Written by tracker agent in response to a 'diagnostics' command
// (Signal 6) — a point-in-time health snapshot (agent version, connection/
// capture state, last error, shift status, OS/platform info) so HR can see
// what's actually happening on that employee's machine right now instead of
// inferring it from stale heartbeat fields. Field names here mirror
// write_diagnostics()'s payload in agent_gui.py exactly (camelCase on this
// side, same on that one since PocketBase KV values are opaque JSON).
const trackerDiagnosticsKeyFor = (email: string) => `tracker_diagnostics_${_slugify(email)}`;

// Grace period before auto-clock-out when heartbeat dies but no quit intent
// signal is present. Protects active shifts from transient server timeouts
// (screenshot uploads blocking heartbeat writes). After 15 min continuously
// dead with no quit signal, the shift is treated as a crash and ended.
export const TRACKER_HEARTBEAT_GRACE_MS = 15 * 60 * 1000;
// ────────────────────────────────────────────────────────────────────────────

function toTimesheet(t: any): TimesheetEntry {
  const clockOut = t.clock_out || undefined;
  return {
    id: t.id, employeeEmail: t.employee_id, date: t.date, clockIn: t.clock_in, clockOut,
    duration: t.duration || undefined,
    status: clockOut ? 'completed' : 'in_progress',
    approvalStatus: t.status || 'pending',
  };
}

// Shared by useTimesheets (below) AND runAbsenceCheck, which must never
// trust a caller-supplied, possibly-stale React Query cache for this data
// (see the BUGFIX comment on runAbsenceCheck's own fetchFreshTimesheets
// call for the full story) — always does a real network round trip.
export async function fetchTimesheetsFresh(): Promise<TimesheetEntry[]> {
  try {
    // Was a flat getList(1, 500) with no date filter — once the company
    // accumulates more than 500 recent rows (sorted by -created), OLDER
    // still-open shifts silently fall outside that window. That matters
    // a lot here: runAbsenceCheck/autoCloseStaleOpenShifts/
    // autoCloseOrphanTrackedShifts all depend on seeing every currently
    // open shift to work correctly, regardless of how old its clock-in
    // was. The filter below keeps the same "recent history" scope
    // (last 60 days) for closed shifts, but ALWAYS includes any shift
    // that's still open (clock_out empty) no matter how old, so a
    // busy roster can't silently lose track of a stuck-open shift.
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 3600 * 1000);
    const cutoff = sixtyDaysAgo.toISOString().replace('T', ' ').replace('Z', '');
    const items = await pbList('hr_timesheets', {
      sort: '-created',
      filter: `clock_out = "" || date >= "${cutoff}"`,
    });
    return items.map(toTimesheet);
  } catch (err) {
    console.error('[hrData] getList error in hr_timesheets:', err);
    return [];
  }
}

export function useTimesheets() {
  return useQuery({
    queryKey: ['hr_timesheets'],
    queryFn: fetchTimesheetsFresh,
  });
}

// Replaces the old useKVByPrefix('hr_tracking_settings_prod_v1') pattern
// now that tracking settings live in their own hr_tracking_settings
// collection instead of a single KV blob — same polling cadence/gating as
// useKVByPrefix above.
export function useTrackingSettings() {
  return useQuery({
    queryKey: ['hr_tracking_settings'],
    queryFn: () => hrActions.getAllTrackingSettings(),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
}

export const timesheetActions = {
  // ── Tracking settings (hr_tracking_settings — one row per employee) ────
  // Migrated off the old hr_tracking_settings_prod_v1 KV blob (a single
  // JSON array holding every employee's settings) into a real collection
  // with a unique index on employeeEmail — see hr_tracking_settings'
  // migration notes. getAllTrackingSettings below is for callers that
  // legitimately need everyone's settings at once (the dashboard-mount
  // safety-net sweeps); this one is for a single employee's settings.
  getTrackingSettingsFor: async (email: string): Promise<TrackingSettings> => {
    const escaped = email.replace(/"/g, '\\"');
    const matches = await pbList('hr_tracking_settings', { filter: `employeeEmail ~ "${escaped}"` });
    const found = matches.find((t: any) => (t.employeeEmail || '').toLowerCase() === email.toLowerCase());
    return found
      ? { employeeEmail: found.employeeEmail, enabled: !!found.enabled, intervalMinutes: found.intervalMinutes, excludeFromAutoDelete: !!found.excludeFromAutoDelete, agentToken: found.agentToken, id: found.id }
      : { employeeEmail: email, enabled: false, intervalMinutes: 15, excludeFromAutoDelete: false, agentToken: '' };
  },
  getAllTrackingSettings: async (): Promise<TrackingSettings[]> =>
    (await pbList('hr_tracking_settings')).map((t: any) => ({
      employeeEmail: t.employeeEmail, enabled: !!t.enabled, intervalMinutes: t.intervalMinutes,
      excludeFromAutoDelete: !!t.excludeFromAutoDelete, agentToken: t.agentToken, id: t.id,
    })),
  updateTrackingSettings: async (email: string, updates: Partial<TrackingSettings>): Promise<TrackingSettings> => {
    // CRITICAL FIX (2026-08-19): this used to build the write payload as
    // `{...defaults, ...updates}` where `defaults` was a hard-coded
    // {enabled: false, intervalMinutes: 15, excludeFromAutoDelete: false,
    // agentToken: <freshly random>} object — NOT "fall back to this only
    // if creating a new row," but "always start from this, then layer the
    // caller's partial update on top." Since pb.collection().update() is a
    // real partial write (whatever keys are present in the payload get
    // written, full stop), any caller that only intended to change ONE
    // field silently overwrote every other field back to that hard-coded
    // default on every single call. Concretely, this meant:
    //   - regenerateAgentToken() (passes only {agentToken}) silently reset
    //     enabled back to false and intervalMinutes back to 15 every time
    //     an employee regenerated their own setup code.
    //   - TrackingView.tsx's handleIntervalChange (only {intervalMinutes})
    //     and handleExcludeToggle (only {excludeFromAutoDelete}) each
    //     silently turned tracking OFF for that employee as a side effect
    //     of an unrelated settings change.
    //   - Even handleToggle (only {enabled}) silently regenerated a brand
    //     new agentToken on every toggle, invalidating whatever setup code
    //     the employee's desktop agent already had paired.
    // Root-caused via olivia@delcargo.us's hr_tracking_settings row showing
    // enabled: false, updated within seconds of her shift starting/agent
    // reconnecting — consistent with someone regenerating her code around
    // then and unknowingly flipping tracking off as a side effect.
    // Fix: fetch the REAL existing row first and use ITS current values as
    // the base for anything `updates` doesn't touch. The hard-coded
    // `defaults` (including a freshly-random agentToken) now only apply
    // when there is no existing row at all — genuine first-time creation.
    const existing = await hrActions.getTrackingSettingsFor(email);
    const base = existing.agentToken
      ? { enabled: existing.enabled, intervalMinutes: existing.intervalMinutes, excludeFromAutoDelete: existing.excludeFromAutoDelete, agentToken: existing.agentToken }
      : {
          enabled: false, intervalMinutes: 15, excludeFromAutoDelete: false,
          agentToken: `agt_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`,
        };
    // Write employeeEmail lowercased on create — otherwise a caller passing
    // a mixed-case email here (e.g. from a not-yet-normalized profile) would
    // seed a mixed-case row that every OTHER lookup in this file then has to
    // work around via a `~` filter + client-side lowercase check.
    const row = await pbUpsertByField('hr_tracking_settings', 'employeeEmail', email, { ...base, ...updates, employeeEmail: email.toLowerCase() });
    return { employeeEmail: row.employeeEmail, enabled: !!row.enabled, intervalMinutes: row.intervalMinutes, excludeFromAutoDelete: !!row.excludeFromAutoDelete, agentToken: row.agentToken, id: row.id };
  },
  regenerateAgentToken: async (email: string): Promise<string> => {
    const token = `agt_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
    await hrActions.updateTrackingSettings(email, { agentToken: token });
    return token;
  },
  getTrackerHeartbeat: (email: string): Promise<TrackerHeartbeat | null> =>
    pbGetKV(`tracker_heartbeat_${email.toLowerCase().replace(/[^a-z0-9]/g, '_')}`),
  getAllTrackerHeartbeats: async (): Promise<TrackerHeartbeat[]> =>
    (await pbGetKVByPrefix('tracker_heartbeat_')).map(row => row.value as TrackerHeartbeat),
  // See ShiftStopSignal above — the tracker agent writes this the instant it
  // auto-clocks someone out from quitting. Never deleted server-side (the
  // agent just overwrites it on the next occurrence); the caller is
  // responsible for tracking which timestamp it's already shown a popup for
  // (see the localStorage check in employee/page.tsx) so the same signal
  // doesn't re-trigger the modal on every poll.
  getShiftStopSignal: (email: string): Promise<ShiftStopSignal | null> =>
    pbGetKV(shiftStopSignalKeyFor(email)),
  isHeartbeatLive: (hb: TrackerHeartbeat | null, intervalMinutes: number = 3): boolean => {
    if (!hb?.lastSeenAt) return false;
    // Extended from (interval+2) to (interval+10) minutes. The extra 8 min
    // buffer absorbs transient PocketBase timeouts (screenshot uploads blocking
    // heartbeat writes) so a slow server never falsely appears as "tracker gone".
    const toleranceMs = (Math.max(3, intervalMinutes) + 10) * 60 * 1000;
    return (Date.now() - new Date(hb.lastSeenAt).getTime()) < toleranceMs;
  },

  // ── 5-Signal System — new hrActions (Signals 2–5) ────────────────────────

  // Signal 2: Quit intent — written by tracker agent on deliberate quit.
  // Portal reads this to distinguish "deliberate quit" (clock out immediately)
  // from "server blip" (wait TRACKER_HEARTBEAT_GRACE_MS grace period).
  getTrackerQuitIntent: (email: string): Promise<TrackerQuitIntent | null> =>
    pbGetKV(trackerQuitIntentKeyFor(email)),
  clearTrackerQuitIntent: async (email: string): Promise<void> => {
    await pbDeleteKVByKeys([trackerQuitIntentKeyFor(email)]);
  },

  // Signal 3: Ping — portal writes this before allowing shift start.
  // Tracker agent reads via realtime SSE and responds with Signal 4 (pong).
  //
  // BUGFIX 2026-09-08: every call in this handshake is now wrapped in
  // withTimeout(). Employees were seeing "Connecting to tracker..." hang
  // on Start Shift for anywhere from a few seconds to (confirmed via
  // Cloudflare Web Analytics) over 11 minutes in the worst case — because
  // the polling loop in employee/page.tsx budgets 8 seconds total assuming
  // each getTrackerPong() call resolves near-instantly, but the PocketBase
  // client (pocketbase.ts) has no request timeout at all. A single stalled
  // request on a flaky connection could hang far past its 500ms slot with
  // nothing to cut it off. A 4s per-call ceiling here guarantees no single
  // attempt can ever hold up the button for more than that, regardless of
  // network conditions — the loop's own 8s budget (now fixed to track real
  // wall-clock time, see employee/page.tsx) takes over from there.
  writeTrackerPing: async (email: string, requestId: string): Promise<void> => {
    await withTimeout(pbSetKV(trackerPingKeyFor(email), {
      employeeEmail: email,
      requestId,
      requestedAt: new Date().toISOString(),
    } as TrackerPing), 4000, 'writeTrackerPing');
  },
  clearTrackerPing: async (email: string): Promise<void> => {
    await withTimeout(pbDeleteKVByKeys([trackerPingKeyFor(email)]), 4000, 'clearTrackerPing');
  },

  // Signal 4: Pong — tracker agent writes this in response to a ping.
  // Portal polls for this with matching requestId (500ms interval, 8s timeout).
  getTrackerPong: (email: string): Promise<TrackerPong | null> =>
    withTimeout(pbGetKV(trackerPongKeyFor(email)), 4000, 'getTrackerPong').catch(() => null),
  clearTrackerPong: async (email: string): Promise<void> => {
    await withTimeout(pbDeleteKVByKeys([trackerPongKeyFor(email)]), 4000, 'clearTrackerPong');
  },

  // Signal 5: Stop command — portal writes this when shift ends (via clockOut).
  // Tracker agent reads via realtime SSE, stops capturing immediately, then
  // deletes this key. Also written by clockOut() directly — see below.
  writeTrackerStopCmd: async (email: string): Promise<void> => {
    await pbSetKV(trackerStopCmdKeyFor(email), {
      employeeEmail: email,
      commandId: Math.random().toString(36).slice(2) + Date.now().toString(36),
      issuedAt: new Date().toISOString(),
    } as TrackerStopCommand);
  },

  // Signal 6: Command — portal writes this when HR/Admin clicks "Run
  // Diagnostics" or "Reload Settings Now" in TrackingView. Tracker agent
  // reads via realtime SSE, acts on it, and deletes the key itself
  // (clear_command in agent_gui.py) — nothing to clean up on this side.
  writeTrackerCommand: async (email: string, type: 'diagnostics' | 'reload_settings'): Promise<void> => {
    await pbSetKV(trackerCommandKeyFor(email), {
      employeeEmail: email,
      type,
      issuedAt: new Date().toISOString(),
    } as TrackerCommand);
  },

  // Signal 7: Diagnostics response — tracker agent writes this after acting
  // on a 'diagnostics' command. Portal polls for it (see
  // TrackingView.tsx's handleRunDiagnostics: 1s interval, 10s timeout) —
  // an agent older than v19 (or one that's offline) never responds at all,
  // which is the expected/common case during the soft rollout, not a bug.
  getTrackerDiagnostics: (email: string): Promise<TrackerDiagnostics | null> =>
    pbGetKV(trackerDiagnosticsKeyFor(email)),
  clearTrackerDiagnostics: async (email: string): Promise<void> => {
    await pbDeleteKVByKeys([trackerDiagnosticsKeyFor(email)]);
  },

  // Employee/HR self-service escape hatch for the "another device is
  // active" / stuck-superseded state: when a still-running tracker's own
  // heartbeat row is stale-but-not-yet-expired, a brand new device can get
  // permanently blocked from claiming the account otherwise. This clears
  // every tracker session/signal key for this email in one shot so the
  // employee can reconnect immediately, without waiting out any staleness
  // window. Also fires Signal 5 (stop command) first in case some tracker
  // instance is actually still alive somewhere and just hasn't reported a
  // fresh heartbeat — that way a genuinely-live old device stops capturing
  // rather than being left to write over the freshly-cleared heartbeat.
  // Safe/idempotent to call even when nothing is actually stuck.
  forceDisconnectAllTrackers: async (email: string): Promise<void> => {
    await hrActions.writeTrackerStopCmd(email).catch(() => { /* best-effort */ });
    await pbDeleteKVByKeys([
      `tracker_heartbeat_${_slugify(email)}`,
      trackerPingKeyFor(email),
      trackerPongKeyFor(email),
      trackerQuitIntentKeyFor(email),
    ]);
  },

  // ── Manual-shift tab heartbeat + abandoned-tab safety net ───────────────
  touchShiftTabHeartbeat: async (email: string): Promise<void> => {
    try {
      await pbSetKV(shiftTabHeartbeatKeyFor(email), { employeeEmail: email, lastSeenAt: new Date().toISOString() } as ShiftTabHeartbeat);
    } catch { /* best-effort — a missed heartbeat just means one earlier stale-check window */ }
  },
  clearShiftTabHeartbeat: async (email: string): Promise<void> => {
    await pbDeleteKVByKeys([shiftTabHeartbeatKeyFor(email)]);
  },
  isShiftTabHeartbeatLive: (hb: ShiftTabHeartbeat | null): boolean =>
    !!hb?.lastSeenAt && (Date.now() - new Date(hb.lastSeenAt).getTime()) < SHIFT_TAB_HEARTBEAT_STALE_MS,

  // Fire-and-forget clock-out sent from a `pagehide` handler as the tab is
  // actually closing. A normal awaited hrActions.clockOut() call has no
  // guarantee of completing once the page starts tearing down, so this
  // uses fetch's `keepalive` option instead — the browser keeps the
  // request alive in the background past unload (the JSON body here is
  // tiny, well under keepalive's ~64KB cap). Best-effort only: this can't
  // run at all on a crash, force-quit, or killed process — exactly why
  // closeStaleManualShiftIfAbandoned exists as an independent second
  // safety net rather than relying on this alone.
  beaconClockOut: (shiftId: string, clockInISO: string): void => {
    try {
      const nowIso = new Date().toISOString();
      const url = `${pb.baseUrl}/api/collections/hr_timesheets/records/${shiftId}`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (pb.authStore.token) headers['Authorization'] = pb.authStore.token;
      fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ clock_out: nowIso, duration: formatDurationBetween(clockInISO, nowIso) }),
        keepalive: true,
      }).catch(() => { /* best-effort */ });
    } catch { /* best-effort */ }
  },

  // Safety net for a manually-started shift (non-USA employees only — USA
  // is governed by GPS geofencing) whose tab is just gone: closed
  // gracefully but the pagehide beacon above didn't get through in time,
  // or the tab/app crashed or was force-quit, neither of which gives any
  // handler a chance to run. Called once whenever the Employee dashboard
  // discovers an already-open shift for this profile. If nothing has kept
  // this shift's tab heartbeat warm recently AND the desktop tracker isn't
  // live either (so nothing else is actively watching this shift right
  // now), treats it as abandoned, clocks it out, and notifies the same way
  // performLogout does — including setting the same
  // shift_auto_stopped_<email> localStorage flag so the employee gets the
  // same "your shift was auto-ended" notice on next login.
  closeStaleManualShiftIfAbandoned: async (profile: Profile): Promise<boolean> => {
    if (profile.region === 'USA') return false;
    const open = await hrActions.getOpenShift(profile.email);
    if (!open) return false;
    // BUGFIX 2026-09-07: skip employees with tracker-based tracking
    // enabled entirely — see the matching comment in Pass 2 of
    // pb_hooks/auto_close_stale_shifts.pb.js for the full story. In short,
    // the shift-tab heartbeat below is expected to look stale for a
    // tracked employee (they don't need the browser tab open at all), so
    // this function fell through to its own tracker check on a tolerance
    // tighter than the dedicated tracker-orphan logic elsewhere, and was
    // falsely clocking out employees who were still actively working.
    const trackingSettings = await hrActions.getTrackingSettingsFor(profile.email);
    if (trackingSettings.enabled) return false;
    const [tabHb, trackerHb] = await Promise.all([
      pbGetKV(shiftTabHeartbeatKeyFor(profile.email)) as Promise<ShiftTabHeartbeat | null>,
      hrActions.getTrackerHeartbeat(profile.email),
    ]);
    if (hrActions.isShiftTabHeartbeatLive(tabHb) || hrActions.isHeartbeatLive(trackerHb)) return false;
    await hrActions.clockOut(profile.email);
    await hrActions.clearShiftTabHeartbeat(profile.email);
    await hrActions.addNotification(profile.email, 'employee', 'Your shift was automatically ended because the app was closed.');
    // 'shift' category + pushTitle/senderEmail so this actually reaches
    // HR/Admin's phones (push_notifications.pb.js looks up profile.email's
    // profile_picture as the Android large icon) instead of only ever
    // showing up in the in-app bell, same treatment as the manual/GPS shift
    // notifications below.
    const shiftEndedName = displayName(profile, 'hr');
    await hrActions.addNotification('all', 'hr', `${shiftEndedName} closed the app while on shift — their shift was ended automatically.`, 'shift', shiftEndedName, profile.email);
    // Admin gets the same dashboard row but no push — HR already got
    // pushed for this exact event, and Admin doesn't need a phone buzz for
    // every single auto-ended shift company-wide on top of that.
    await hrActions.addNotification('all', 'admin', `${shiftEndedName} closed the app while on shift — their shift was ended automatically.`, undefined, undefined, profile.email);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(`shift_auto_stopped_${profile.email.toLowerCase()}`, '1'); } catch { /* ignore */ }
    }
    return true;
  },

  // Safety net for a tracker-governed shift left open because the employee
  // shut down/killed their tracked device outright (PC shutdown, tracker
  // force-quit, killed process, dead battery) — quit_app()'s own
  // auto-clock-out in tracker-agent/agent_gui.py never gets a chance to run
  // in any of those cases, so the shift is left open (clock_out: '') with a
  // dead heartbeat, sometimes for hours or overnight. Left alone, "still
  // open" gets misread elsewhere as "still being worked" (or, once finally
  // closed by hand, produces an absurd multi-hundred-minute inactivity
  // interval — the "1000+ minute" false absences reported by Windows
  // employees). Called alongside runAbsenceCheck (see hr/page.tsx,
  // admin/page.tsx) so it runs on every HR/Admin dashboard load. Closes the
  // shift at the employee's LAST REAL HEARTBEAT timestamp — i.e. when they
  // were actually last known to be there — never at "now", so a shift
  // discovered the next morning isn't credited (or blamed) for the entire
  // overnight gap. Deliberately scoped to only employees with screen
  // tracking enabled (TrackingSettings.enabled) AND an actual heartbeat on
  // record — GPS/manual-shift employees who've never run a tracker at all
  // have "no heartbeat ever" by default, which isn't evidence of anything,
  // so they're left to the existing closeStaleManualShiftIfAbandoned safety
  // net instead.
  autoCloseOrphanTrackedShifts: async (timesheets: TimesheetEntry[]): Promise<void> => {
    const ORPHAN_SHIFT_GRACE_MS = 30 * 60 * 1000; // reverted to 30 min on 2026-09-07 — see MIN_SHIFT_AGE_MS note
    const MIN_SHIFT_AGE_MS = 45 * 60 * 1000; // reverted to 45 min on 2026-09-07 — the 25-min value caused false auto-closes for employees who were still actively working (confirmed via camila@delcargo.us). 45 min keeps enough margin above the 13-min tracker / 15-min tab heartbeat tolerances that a normal brief connectivity blip can't trigger a close.
    const now = Date.now();
    const openShifts = timesheets.filter(t => !t.clockOut && t.clockIn);

    // Fetched ONCE for the whole batch rather than once per open shift — the
    // hr_tracking_settings collection holds every employee's settings, so
    // re-fetching it per shift inside the loop below was N identical
    // full-collection reads for N open shifts. getTrackingSettingsFor still
    // does its own fetch+find for any OTHER caller that just wants one
    // employee's settings; this loop only needs the full list once to look
    // employees up locally.
    const allTrackingSettings = await hrActions.getAllTrackingSettings();
    const settingsForEmail = (email: string): TrackingSettings =>
      allTrackingSettings.find(t => t.employeeEmail.toLowerCase() === email.toLowerCase())
        || { employeeEmail: email, enabled: false, intervalMinutes: 15, excludeFromAutoDelete: false, agentToken: '' };

    for (const shift of openShifts) {
      const clockInMs = new Date(shift.clockIn).getTime();
      if (isNaN(clockInMs) || now - clockInMs < MIN_SHIFT_AGE_MS) continue;

      try {
        const settings = settingsForEmail(shift.employeeEmail);
        if (!settings.enabled) continue; // not a tracker-governed shift — leave to other safety nets

        const hb = await hrActions.getTrackerHeartbeat(shift.employeeEmail);
        if (!hb?.lastSeenAt) continue; // never connected at all — ambiguous, don't guess

        const lastSeenMs = new Date(hb.lastSeenAt).getTime();
        if (isNaN(lastSeenMs) || now - lastSeenMs < ORPHAN_SHIFT_GRACE_MS) continue; // recent enough — genuinely active

        // Close at the last real heartbeat time, clamped to never be
        // earlier than clock-in (a corrupt/stale-from-before-this-shift
        // heartbeat shouldn't produce a negative-duration shift).
        const closeAtIso = new Date(Math.max(lastSeenMs, clockInMs)).toISOString();

        // BUGFIX (2026-09-11, live): this used to also pass status:
        // 'completed' — but hr_timesheets.status is a select field
        // restricted to the APPROVAL workflow values ('pending' |
        // 'approved' | 'rejected'), not a shift-open/closed state. Every
        // write here was silently rejected by PocketBase with a 400 (the
        // 'completed' value isn't in that enum), so this safety net never
        // actually closed a single stale shift in practice. "Completed"
        // for a shift is already fully derived from clock_out being
        // non-empty (see toTimesheet's status: clockOut ? 'completed' :
        // 'in_progress') — there's nothing else to write here.
        await pbUpdate('hr_timesheets', shift.id, {
          clock_out: closeAtIso,
          duration: formatDurationBetween(shift.clockIn, closeAtIso),
        });
        try { await pbDeleteKVByKeys([shiftTabHeartbeatKeyFor(shift.employeeEmail)]); } catch { /* best-effort */ }
        const name = displayName({ fullName: shift.employeeEmail }, 'hr');
        await hrActions.addNotification(
          shift.employeeEmail, 'employee',
          "Your shift was automatically ended because the DelCargo Tracker app stopped reporting in while your shift was still open. If this looks wrong, contact HR."
        ).catch(() => {});
        await hrActions.addNotification('all', 'hr', `${name}'s shift was auto-closed — their tracker stopped reporting in while the shift was still open.`, 'shift', name, shift.employeeEmail).catch(() => {});
        // Dashboard-only for Admin — HR already got the pushable copy above.
        await hrActions.addNotification('all', 'admin', `${name}'s shift was auto-closed — their tracker stopped reporting in while the shift was still open.`, undefined, undefined, shift.employeeEmail).catch(() => {});
      } catch {
        // Best-effort per-shift — one bad lookup/write shouldn't stop the rest.
      }
    }
  },

  // Last-resort catch-all for ANY open shift left running unreasonably long
  // — regardless of category (GPS/USA, manual/Pakistan, or tracker-governed)
  // — which is what was actually behind employees showing 3000+ minutes of
  // "shift time" in a day. autoCloseOrphanTrackedShifts above only fires for
  // employees with screen tracking enabled AND a heartbeat on record;
  // closeStaleManualShiftIfAbandoned only fires if that specific employee
  // reopens their own dashboard tab; and GPS/USA employees have no
  // server-side safety net at all today — if their phone dies or the app is
  // force-killed mid-shift, nothing ever clocks them out. Any of those gaps
  // leaves a shift open indefinitely, and since runAbsenceCheck buckets all
  // of an open shift's elapsed minutes onto its clock-in day alone, a
  // multi-day-open shift doesn't just look absurd — every day after the
  // first shows up with ZERO recorded minutes and gets falsely flagged as a
  // no-clock-in absence, even though the (buggy) shift was technically still
  // "open" through it. Run this after the more precise safety nets above —
  // it only ever touches a shift once it's already far outside any
  // legitimate single-shift length. Closes at the last known tracker
  // heartbeat when one exists and falls within the cap window (most
  // accurate), otherwise at the hard cap itself.
  autoCloseStaleOpenShifts: async (timesheets: TimesheetEntry[], employees: Profile[]): Promise<void> => {
    const MAX_SHIFT_DURATION_MS = 16 * 60 * 60 * 1000; // no legitimate single shift runs longer than this
    const now = Date.now();
    const openShifts = timesheets.filter(t => !t.clockOut && t.clockIn);

    for (const shift of openShifts) {
      const clockInMs = new Date(shift.clockIn).getTime();
      if (isNaN(clockInMs) || now - clockInMs < MAX_SHIFT_DURATION_MS) continue; // still within a plausible single shift

      try {
        let closeAtMs = clockInMs + MAX_SHIFT_DURATION_MS;
        const hb = await hrActions.getTrackerHeartbeat(shift.employeeEmail);
        if (hb?.lastSeenAt) {
          const lastSeenMs = new Date(hb.lastSeenAt).getTime();
          if (!isNaN(lastSeenMs) && lastSeenMs > clockInMs && lastSeenMs < closeAtMs) closeAtMs = lastSeenMs;
        }
        const closeAtIso = new Date(closeAtMs).toISOString();

        // See the BUGFIX comment on the equivalent write in
        // autoCloseOrphanTrackedShifts above — same invalid status:
        // 'completed' write, same silent-400 failure, same fix.
        await pbUpdate('hr_timesheets', shift.id, {
          clock_out: closeAtIso,
          duration: formatDurationBetween(shift.clockIn, closeAtIso),
        });
        try { await pbDeleteKVByKeys([shiftTabHeartbeatKeyFor(shift.employeeEmail)]); } catch { /* best-effort */ }

        const profile = employees.find(e => e.email.toLowerCase() === shift.employeeEmail.toLowerCase());
        const name = displayName(profile || { fullName: shift.employeeEmail }, 'hr');
        const capHours = Math.round(MAX_SHIFT_DURATION_MS / 3600000);
        await hrActions.addNotification(
          shift.employeeEmail, 'employee',
          `Your shift starting ${formatDateNY(shift.clockIn)} was still open after ${capHours}+ hours and has been automatically ended. If this looks wrong, contact HR.`
        ).catch(() => {});
        await hrActions.addNotification('all', 'hr', `${name}'s shift from ${formatDateNY(shift.clockIn)} was still open after ${capHours}+ hours and was auto-closed.`, 'shift', name, shift.employeeEmail).catch(() => {});
        // Dashboard-only for Admin — HR already got the pushable copy above.
        await hrActions.addNotification('all', 'admin', `${name}'s shift from ${formatDateNY(shift.clockIn)} was still open after ${capHours}+ hours and was auto-closed.`, undefined, undefined, shift.employeeEmail).catch(() => {});
      } catch {
        // Best-effort per-shift — one bad lookup/write shouldn't stop the rest.
      }
    }
  },

  // ── Timesheets ────────────────────────────────────────────────────────
  // Uses a case-insensitive `~` filter + exact client-side re-check (the
  // established pattern elsewhere in this file), not a plain `=` filter,
  // because hr_timesheets rows can predate the email-lowercasing fix in
  // fromProfileFields/addEmployee — a profile saved back when its email was
  // stored mixed-case would otherwise silently never match its own open
  // shift here, leaving clockIn/clockOut looking broken for that employee.
  getOpenShift: async (employeeEmail: string): Promise<TimesheetEntry | null> => {
    const wanted = employeeEmail.toLowerCase();
    const escaped = employeeEmail.replace(/"/g, '\\"');
    const matches = (await pbList('hr_timesheets', { filter: `employee_id ~ "${escaped}" && clock_out = ""` })).map(toTimesheet);
    return matches.find(t => (t.employeeEmail || '').toLowerCase() === wanted) || null;
  },
  clockIn: async (employeeEmail: string): Promise<TimesheetEntry> => {
    const existingOpen = await hrActions.getOpenShift(employeeEmail);
    if (existingOpen) return existingOpen;
    const now = new Date();
    // Calendar date is bucketed by America/New_York wall-clock time, not UTC
    // and not the device's local timezone — see src/lib/timezone.ts. Without
    // this, an employee clocking in late at night could have their shift
    // filed under the wrong day depending on server/device timezone.
    const created = await pbCreate('hr_timesheets', {
      employee_id: employeeEmail, date: getNYDateString(now), clock_in: now.toISOString(),
      clock_out: '', status: 'pending',
    });
    return toTimesheet(created);
  },
  clockOut: async (employeeEmail: string): Promise<TimesheetEntry | null> => {
    const open = await hrActions.getOpenShift(employeeEmail);
    if (!open) return null;
    const nowIso = new Date().toISOString();
    const updated = await pbUpdate('hr_timesheets', open.id, { clock_out: nowIso, duration: formatDurationBetween(open.clockIn, nowIso) });
    // Clean up tab heartbeat (existing) and write Signal 5 stop command so the
    // tracker agent stops capturing immediately via realtime SSE — both are
    // best-effort: a failure here must never block the clock-out itself.
    try { await pbDeleteKVByKeys([shiftTabHeartbeatKeyFor(employeeEmail)]); } catch { /* best-effort */ }
    try { await hrActions.writeTrackerStopCmd(employeeEmail); } catch { /* best-effort */ }
    return toTimesheet(updated);
  },
};
