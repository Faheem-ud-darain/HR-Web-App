import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackerDiagnosis } from './core/trackerDiagnosis';
import type { IntegrityFinding } from './core/trackingSettings';

// The scheduled alert, run against the real route with the database helpers replaced: it must never touch production.
const db = vi.hoisted(() => ({
  state: null as Record<string, string> | null,
  notifications: [] as { role: string; message: string }[],
  saves: 0,
  syncs: [] as { email: string; enabled: boolean }[],
  syncResult: true,
  health: { findings: [] as IntegrityFinding[], diagnoses: [] as TrackerDiagnosis[] },
  failRead: false,
  failNotify: false,
}));

vi.mock('@/lib/pbAdmin', () => ({
  adminFindByField: async () => (db.state ? { id: '1', data: db.state } : null),
  adminUpsertByField: async (_c: string, _f: string, _v: string, data: Record<string, string>) => { db.state = data; db.saves++; },
  adminAddNotification: async (_email: string, role: string, message: string) => { if (db.failNotify) throw new Error('notifications down'); db.notifications.push({ role, message }); },
}));
vi.mock('@/lib/trackingSync', () => ({ syncProfileTrackingFlag: async (email: string, enabled: boolean) => { db.syncs.push({ email, enabled }); return db.syncResult; } }));
vi.mock('@/lib/trackingIntegrity', () => ({
  loadTrackingHealth: async () => { if (db.failRead) throw new Error('database down'); return db.health; },
}));

import { POST } from '../app/api/cron/tracking-integrity/route';

const SECRET = 'a-long-enough-cron-secret-1234567890';
const call = (token: string | null = SECRET) => POST(new Request('https://app.test/api/cron/tracking-integrity', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} }));
const off: IntegrityFinding = { kind: 'on_shift_tracking_off', email: 'zara@x.com', detail: 'On shift with tracking switched OFF.' };
const diagnosis: TrackerDiagnosis = { email: 'zara@x.com', state: 'tracking_off', severity: 'problem', cause: 'On shift with tracking switched OFF, so nothing is being captured.', action: 'Switch tracking on for them in Tracking.',
  details: { trackingOn: false, intervalMinutes: 15, onShiftSince: null, lastSeenAt: null, lastCaptureAt: null, agentVersion: null, device: null, lastError: null, failures: 0 } };

afterEach(() => { vi.useRealTimers(); });

beforeEach(() => {
  vi.useFakeTimers();
  db.state = null; db.notifications = []; db.saves = 0; db.failRead = false; db.failNotify = false; db.syncs = []; db.syncResult = true;
  db.health = { findings: [], diagnoses: [] };
  process.env.CRON_SECRET = SECRET;
});

describe('POST /api/cron/tracking-integrity', () => {
  it('refuses without the secret, and when no secret is configured', async () => {
    expect((await call(null)).status).toBe(401);
    expect((await call('wrong-secret-wrong-secret-wrong')).status).toBe(401);
    process.env.CRON_SECRET = 'short';
    expect((await call()).status).toBe(503);
    expect(db.notifications).toHaveLength(0);
  });

  it('tells HR and Admin who is affected, what is wrong and what to do', async () => {
    db.health = { findings: [off], diagnoses: [diagnosis] };
    const res = await call();
    expect(await res.json()).toEqual({ status: 'ok', flagged: 1, alerted: 1, repaired: 0 });
    expect(db.notifications.map(n => n.role).sort()).toEqual(['admin', 'hr']);
    expect(db.notifications[0].message).toBe('zara@x.com: On shift with tracking switched OFF, so nothing is being captured. Switch tracking on for them in Tracking.');
  });

  it('does not repeat the same alert on the next run, and writes nothing when nothing changed', async () => {
    db.health = { findings: [off], diagnoses: [diagnosis] };
    await call();
    const saved = db.saves;
    const second = await (await call()).json();
    expect(second).toEqual({ status: 'ok', flagged: 1, alerted: 0, repaired: 0 });
    expect(db.notifications).toHaveLength(2);
    expect(db.saves).toBe(saved);
  });

  it('forgets a fixed problem, so it alerts again if it comes back', async () => {
    db.health = { findings: [off], diagnoses: [diagnosis] };
    await call();
    db.health = { findings: [], diagnoses: [] };
    await call();
    expect(db.state).toEqual({});
    db.health = { findings: [off], diagnoses: [diagnosis] };
    expect((await (await call()).json()).alerted).toBe(1);
  });

  it('falls back to the finding text when there is no diagnosis for the person', async () => {
    db.health = { findings: [off], diagnoses: [] };
    await call();
    expect(db.notifications[0].message).toBe('zara@x.com: On shift with tracking switched OFF.');
  });

  it('repairs a profile copy that disagrees with the real switch, in the direction the switch says', async () => {
    const mismatch = (email: string, settingsEnabled: boolean): IntegrityFinding => ({ kind: 'flag_mismatch', email, settingsEnabled, detail: 'Flags disagree.' });
    db.health = { findings: [mismatch('luna@x.com', true), mismatch('rahim@x.com', false)], diagnoses: [] };
    expect(await (await call()).json()).toEqual({ status: 'ok', flagged: 2, alerted: 0, repaired: 2 });
    expect(db.syncs).toEqual([{ email: 'luna@x.com', enabled: true }, { email: 'rahim@x.com', enabled: false }]);
    expect(db.notifications).toHaveLength(0); // repairing is not an alert
  });

  it('does not count a repair that failed, and never repairs more than the cap in one run', async () => {
    db.syncResult = false;
    const many: IntegrityFinding[] = Array.from({ length: 14 }, (_, i) => ({ kind: 'flag_mismatch', email: `p${i}@x.com`, settingsEnabled: true, detail: 'x' }));
    db.health = { findings: many, diagnoses: [] };
    expect((await (await call()).json()).repaired).toBe(0);
    expect(db.syncs).toHaveLength(10);
  });

  it('repairs even when the alert cannot be delivered', async () => {
    db.failNotify = true;
    db.health = { findings: [off, { kind: 'flag_mismatch', email: 'luna@x.com', settingsEnabled: true, detail: 'x' }], diagnoses: [diagnosis] };
    await call();
    expect(db.syncs).toEqual([{ email: 'luna@x.com', enabled: true }]);
  });

  it('does not always start with the same people when there are more mismatches than the cap', async () => {
    db.syncResult = false;
    const many: IntegrityFinding[] = Array.from({ length: 14 }, (_, i) => ({ kind: 'flag_mismatch', email: `p${i}@x.com`, settingsEnabled: true, detail: 'x' }));
    db.health = { findings: many, diagnoses: [] };
    const seen = new Set<string>();
    for (const t of [0, 1, 2]) { vi.setSystemTime(t * 20 * 60 * 1000); db.syncs = []; await call(); db.syncs.forEach(s => seen.add(s.email)); }
    expect(seen.size).toBeGreaterThan(10);
  });

  it('a failed read alerts nobody, saves nothing and reports an error', async () => {
    db.failRead = true;
    const res = await call();
    expect(res.status).toBe(502);
    expect(db.notifications).toHaveLength(0);
    expect(db.saves).toBe(0);
  });
});
