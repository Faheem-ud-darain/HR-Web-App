// Rules for changing an employee's tracking settings (hr_tracking_settings), kept as plain
// TypeScript so the server route and the tests use exactly the same code.
//
// Why this exists: the browser used to write this table directly. A failed read looked
// like "no row yet", so a save wrote first-time defaults (tracking OFF + a new random
// setup code) over a real row. Now every change goes through /api/tracking/settings,
// which uses planTrackingSettingsChange: an existing row only ever receives the fields
// the caller actually sent, and who may send what is decided here.

export interface TrackingSettingsRow {
  id?: string;
  employeeEmail: string;
  enabled: boolean;
  intervalMinutes: number;
  excludeFromAutoDelete: boolean;
  agentToken: string;
}

export type TrackingSettingsUpdates = Partial<Pick<TrackingSettingsRow, 'enabled' | 'intervalMinutes' | 'excludeFromAutoDelete' | 'agentToken'>>;

export interface Actor { email: string; role: string }

const TOKEN_RE = /^agt_[a-z0-9]{10,40}$/;
const STAFF = new Set(['hr', 'admin']);
const ALLOWED_KEYS = ['enabled', 'intervalMinutes', 'excludeFromAutoDelete', 'agentToken'] as const;

export function newAgentToken(random: () => number = Math.random): string {
  const part = () => random().toString(36).slice(2, 10).padEnd(8, '0');
  return `agt_${part()}${part()}`;
}

export type SettingsChangePlan =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      /** 'create' = the employee has no row yet; 'update' = patch the existing row; 'none' = nothing to write. */
      mode: 'create' | 'update' | 'none';
      /** Exactly the fields to write — never more than the caller sent (plus defaults on create). */
      write: Record<string, unknown>;
      /** field -> [old, new], for the audit log. */
      changes: Record<string, [unknown, unknown]>;
    };

export function planTrackingSettingsChange(args: {
  actor: Actor;
  targetEmail: string;
  updates: unknown;
  existing: TrackingSettingsRow | null;
  random?: () => number;
}): SettingsChangePlan {
  const { actor, existing } = args;
  const target = (args.targetEmail || '').trim().toLowerCase();
  const staff = STAFF.has(actor.role);
  if (!target || !/^[^@\s]+@[^@\s]+$/.test(target)) return { ok: false, status: 400, error: 'A valid employee email is required.' };
  if (!staff && target !== actor.email.trim().toLowerCase()) return { ok: false, status: 403, error: 'You can only change your own tracker setup.' };

  const raw = (args.updates && typeof args.updates === 'object' ? args.updates : {}) as Record<string, unknown>;
  const unknownKey = Object.keys(raw).find(k => !(ALLOWED_KEYS as readonly string[]).includes(k));
  if (unknownKey) return { ok: false, status: 400, error: `Unknown setting: ${unknownKey}.` };
  // An employee may only get/refresh their own setup code. Turning tracking on/off or changing
  // the interval and retention is HR/Admin only.
  if (!staff) {
    const forbidden = Object.keys(raw).find(k => k !== 'agentToken');
    if (forbidden) return { ok: false, status: 403, error: 'Only HR or Admin can change this setting.' };
  }

  const clean: Record<string, unknown> = {};
  if ('enabled' in raw) {
    if (typeof raw.enabled !== 'boolean') return { ok: false, status: 400, error: 'enabled must be true or false.' };
    clean.enabled = raw.enabled;
  }
  if ('excludeFromAutoDelete' in raw) {
    if (typeof raw.excludeFromAutoDelete !== 'boolean') return { ok: false, status: 400, error: 'excludeFromAutoDelete must be true or false.' };
    clean.excludeFromAutoDelete = raw.excludeFromAutoDelete;
  }
  if ('intervalMinutes' in raw) {
    const n = raw.intervalMinutes;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 1 || n > 240) return { ok: false, status: 400, error: 'intervalMinutes must be between 1 and 240.' };
    clean.intervalMinutes = Math.round(n);
  }
  if ('agentToken' in raw) {
    if (typeof raw.agentToken !== 'string' || !TOKEN_RE.test(raw.agentToken)) return { ok: false, status: 400, error: 'Invalid setup code.' };
    clean.agentToken = raw.agentToken;
  }

  if (!existing) {
    // First-time creation: the ONLY place defaults and a fresh code apply.
    const write = {
      enabled: false, intervalMinutes: 15, excludeFromAutoDelete: false,
      agentToken: newAgentToken(args.random),
      ...clean,
      employeeEmail: target,
    };
    return { ok: true, mode: 'create', write, changes: Object.fromEntries(Object.entries(write).filter(([k]) => k !== 'employeeEmail').map(([k, v]) => [k, [null, v]])) };
  }

  const changes: Record<string, [unknown, unknown]> = {};
  const write: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(clean)) {
    const old = (existing as unknown as Record<string, unknown>)[k];
    if (old !== v) { changes[k] = [old, v]; write[k] = v; }
  }
  return { ok: true, mode: Object.keys(write).length ? 'update' : 'none', write, changes };
}

/**
 * The single answer to "is tracking on for this person?". hr_tracking_settings.enabled is the
 * source of truth (it is what the tracker app and the shift check obey); the profile flag
 * hr_profiles.tracking_enabled is only a fallback for someone who has no real settings row yet.
 * Before this, screens used `profileFlag || settingsFlag`, so the two could disagree and a
 * switched-off tracker still looked "on" on the dashboard.
 */
export function isTrackingOn(profileFlag: boolean | undefined, settings: { enabled?: boolean; agentToken?: string } | null | undefined): boolean {
  if (settings && settings.agentToken) return !!settings.enabled;
  return !!profileFlag;
}

// ── Integrity report ───────────────────────────────────────────────────────────
// A read-only health check over tracking: which employees' flags disagree, and who is on shift
// with nothing being captured. Run on demand from /api/admin/tracking-integrity (and, later,
// from the scheduled daily job). It is the "tell me before it costs hours of screenshots" net.

import { getCaptureGap } from './timesheets';

export interface IntegrityFinding {
  kind: 'flag_mismatch' | 'no_settings_row' | 'on_shift_tracking_off' | 'on_shift_no_captures';
  email: string;
  detail: string;
}

export function buildIntegrityReport(args: {
  /** Only people who should have tracking considered (employees / team leads). */
  profiles: { email: string; role: string; region?: string; trackingEnabled?: boolean }[];
  settings: { employeeEmail: string; enabled: boolean; intervalMinutes: number; agentToken?: string }[];
  openShifts: { employeeEmail: string; clockIn: string }[];
  heartbeats: Record<string, { lastSeenAt?: string; lastCaptureAt?: string | null; captureEnabled?: boolean } | undefined>;
  now?: number;
  heartbeatLiveMs?: number;
}): IntegrityFinding[] {
  const now = args.now ?? Date.now();
  const liveMs = args.heartbeatLiveMs ?? 13 * 60 * 1000;
  const out: IntegrityFinding[] = [];
  const settingsBy = new Map(args.settings.map(s => [s.employeeEmail.toLowerCase(), s]));
  const shiftBy = new Map(args.openShifts.map(s => [s.employeeEmail.toLowerCase(), s]));

  for (const p of args.profiles) {
    if (p.role !== 'employee' && p.role !== 'team_lead') continue;
    const email = p.email.toLowerCase();
    const s = settingsBy.get(email);
    const shift = shiftBy.get(email);
    if (!s || !s.agentToken) {
      if (p.trackingEnabled) out.push({ kind: 'no_settings_row', email, detail: 'The profile says tracking is on, but there is no tracking settings row.' });
      continue;
    }
    if (!!p.trackingEnabled !== !!s.enabled) {
      out.push({ kind: 'flag_mismatch', email, detail: `Profile flag is ${p.trackingEnabled ? 'ON' : 'OFF'} but tracking settings say ${s.enabled ? 'ON' : 'OFF'} (the settings value is the one that counts).` });
    }
    if (!shift) continue;
    const hb = args.heartbeats[email];
    const seenMs = hb?.lastSeenAt ? new Date(hb.lastSeenAt).getTime() : NaN;
    const gap = getCaptureGap({
      onShift: true, trackingOn: !!s.enabled, heartbeatLive: !isNaN(seenMs) && now - seenMs < liveMs,
      lastCaptureAt: hb?.lastCaptureAt, shiftStartedAt: shift.clockIn, intervalMinutes: s.intervalMinutes, now,
      captureReported: hb?.captureEnabled !== undefined,
    });
    if (gap.status === 'tracking_off') out.push({ kind: 'on_shift_tracking_off', email, detail: 'On shift with tracking switched OFF — nothing is being captured.' });
    if (gap.status === 'no_captures') out.push({ kind: 'on_shift_no_captures', email, detail: `On shift, tracker connected, but no screenshot for ${gap.minutes} minutes.` });
  }
  return out;
}
