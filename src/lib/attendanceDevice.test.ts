import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLAIM_FRESH_MS, decideClaim } from './core/attendanceDevice';

// POST /api/attendance/device against the real route, with the database replaced.
const db = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>(), session: { email: 'Zara@x.com', role: 'employee' } as { email: string; role: string } | null }));
vi.mock('@/lib/serverAuth', () => ({ requireSession: async () => db.session }));
vi.mock('@/lib/pbAdmin', () => ({
  adminFindByField: async (_c: string, _f: string, key: string) => (db.rows.has(key) ? { id: key, data: db.rows.get(key) } : null),
  adminUpsertByField: async (_c: string, _f: string, key: string, data: Record<string, unknown>) => { db.rows.set(key, data); },
}));
import { POST } from '../app/api/attendance/device/route';

const NOW = Date.UTC(2026, 10, 5, 15);
const ask = (deviceId: string, label: string, force = false) => POST(new Request('https://app.test/api/attendance/device', { method: 'POST', headers: { Authorization: 'Bearer x' }, body: JSON.stringify({ deviceId, label, force }) }));

describe('decideClaim', () => {
  const a = { deviceId: 'dev_aaaaaa', label: 'Safari on iOS' };
  const b = { deviceId: 'dev_bbbbbb', label: 'Chrome on Android' };
  const owned = { ...a, at: new Date(NOW - 30_000).toISOString() };

  it('the first phone owns attendance, and keeps it on every later check', () => {
    expect(decideClaim(null, a, NOW)).toMatchObject({ owner: true, ownerLabel: 'Safari on iOS' });
    expect(decideClaim(owned, a, NOW)).toMatchObject({ owner: true });
  });
  it('a second phone is refused and told which device has it', () => {
    expect(decideClaim(owned, b, NOW)).toMatchObject({ owner: false, ownerLabel: 'Safari on iOS', claim: owned });
  });
  it('the second phone takes over when the owner has been silent too long, or when the person says so', () => {
    expect(decideClaim({ ...a, at: new Date(NOW - CLAIM_FRESH_MS - 1).toISOString() }, b, NOW).owner).toBe(true);
    expect(decideClaim(owned, b, NOW, true)).toMatchObject({ owner: true, claim: { deviceId: b.deviceId } });
  });
  it('treats a damaged stored time as stale rather than blocking forever', () => {
    expect(decideClaim({ ...a, at: 'nonsense' }, b, NOW).owner).toBe(true);
  });
});

describe('POST /api/attendance/device', () => {
  beforeEach(() => { db.rows.clear(); db.session = { email: 'Zara@x.com', role: 'employee' }; vi.setSystemTime(NOW); });

  it('needs a signed-in person and a device id', async () => {
    db.session = null;
    expect((await ask('dev_aaaaaa', 'x')).status).toBe(401);
    db.session = { email: 'zara@x.com', role: 'employee' };
    expect((await ask('x', 'x')).status).toBe(400);
  });
  it('first phone owns it, second phone is refused, and force hands it over; one row per person', async () => {
    expect(await (await ask('dev_aaaaaa', 'Safari on iOS')).json()).toEqual({ owner: true, ownerLabel: 'Safari on iOS' });
    expect(await (await ask('dev_bbbbbb', 'Chrome on Android')).json()).toEqual({ owner: false, ownerLabel: 'Safari on iOS' });
    expect(await (await ask('dev_bbbbbb', 'Chrome on Android', true)).json()).toEqual({ owner: true, ownerLabel: 'Chrome on Android' });
    expect(await (await ask('dev_aaaaaa', 'Safari on iOS')).json()).toEqual({ owner: false, ownerLabel: 'Chrome on Android' });
    expect([...db.rows.keys()]).toEqual(['attendance_device:zara@x.com']);
  });
});
