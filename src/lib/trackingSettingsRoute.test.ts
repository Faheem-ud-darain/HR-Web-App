import { beforeEach, describe, expect, it, vi } from 'vitest';

// POST /api/tracking/settings with the database replaced. Whatever is saved, the profile mirror must end up equal to the switch.
const db = vi.hoisted(() => ({
  session: { email: 'hr@x.com', role: 'hr' } as { email: string; role: string } | null,
  row: null as Record<string, unknown> | null,
  patches: [] as Record<string, unknown>[],
  syncs: [] as { email: string; enabled: boolean }[],
  syncResult: true,
}));

vi.mock('@/lib/serverAuth', () => ({ requireSession: async () => db.session }));
vi.mock('@/lib/pbAdmin', () => ({
  pbAdminFetch: async (url: string, init?: { method?: string; body?: string }) => {
    if (url.includes('/hr_tracking_settings_log/')) return {};
    if (init?.method === 'PATCH') { const fields = JSON.parse(init.body || '{}'); db.patches.push(fields); db.row = { ...db.row, ...fields }; return db.row; }
    if (init?.method === 'POST') { db.row = { id: 'new', ...JSON.parse(init.body || '{}') }; return db.row; }
    return { items: db.row ? [db.row] : [] };
  },
}));
vi.mock('@/lib/trackingSync', () => ({ syncProfileTrackingFlag: async (email: string, enabled: boolean) => { db.syncs.push({ email, enabled }); return db.syncResult; } }));

import { POST } from '../app/api/tracking/settings/route';

const post = (body: unknown) => POST(new Request('https://app.test/api/tracking/settings', { method: 'POST', headers: { Authorization: 'Bearer x' }, body: JSON.stringify(body) }));
const existing = (enabled: boolean) => ({ id: 'r1', employeeEmail: 'a@x.com', enabled, intervalMinutes: 15, excludeFromAutoDelete: false, agentToken: 'tok' });

beforeEach(() => { db.session = { email: 'hr@x.com', role: 'hr' }; db.row = existing(true); db.patches = []; db.syncs = []; db.syncResult = true; vi.spyOn(console, 'error').mockImplementation(() => undefined); });

describe('POST /api/tracking/settings', () => {
  it('re-syncs the profile copy even when the save changes nothing, so saving repairs a drifted copy', async () => {
    const res = await post({ email: 'a@x.com', updates: { enabled: true } });
    expect(db.patches).toEqual([]); // nothing to change in the settings row
    expect(db.syncs).toEqual([{ email: 'a@x.com', enabled: true }]);
    expect(await res.json()).toMatchObject({ profileSynced: true });
  });

  it('writes the switch, then makes the profile copy follow it', async () => {
    const res = await post({ email: 'a@x.com', updates: { enabled: false } });
    expect(db.patches).toEqual([{ enabled: false }]);
    expect(db.syncs).toEqual([{ email: 'a@x.com', enabled: false }]);
    expect((await res.json()).settings.enabled).toBe(false);
  });

  it('says so when the profile copy could not be updated, instead of hiding it', async () => {
    db.syncResult = false;
    expect(await (await post({ email: 'a@x.com', updates: { enabled: false } })).json()).toMatchObject({ profileSynced: false });
  });

  it('does not touch the profile copy for a save that is not about `enabled`', async () => {
    await post({ email: 'a@x.com', updates: { intervalMinutes: 20 } });
    expect(db.syncs).toEqual([]);
  });

  it('still refuses a signed-out caller, and an employee changing the switch', async () => {
    db.session = null;
    expect((await post({ email: 'a@x.com', updates: { enabled: true } })).status).toBe(401);
    db.session = { email: 'a@x.com', role: 'employee' };
    const res = await post({ email: 'a@x.com', updates: { enabled: false } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(db.syncs).toEqual([]);
  });
});
