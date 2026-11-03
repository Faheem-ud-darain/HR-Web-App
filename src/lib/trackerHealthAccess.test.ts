import { beforeEach, describe, expect, it, vi } from 'vitest';

// The Tracker Health page is for HR and Admin only. Hiding the menu item is not enough, so the route that feeds it must refuse everyone else.
const db = vi.hoisted(() => ({ session: null as { role: string; email: string } | null, loads: 0 }));

vi.mock('@/lib/serverAuth', () => ({ requireSession: async () => db.session }));
vi.mock('@/lib/trackingIntegrity', () => ({ loadTrackingHealth: async () => { db.loads++; return { findings: [], diagnoses: [] }; } }));

import { GET } from '../app/api/admin/tracking-integrity/route';

const get = () => GET(new Request('https://app.test/api/admin/tracking-integrity', { headers: { Authorization: 'Bearer x' } }));

beforeEach(() => { db.session = null; db.loads = 0; });

describe('GET /api/admin/tracking-integrity', () => {
  it('refuses a signed-out caller, team leads and employees without reading anything', async () => {
    expect((await get()).status).toBe(403);
    for (const role of ['team_lead', 'employee']) {
      db.session = { role, email: 'someone@x.com' };
      expect((await get()).status).toBe(403);
    }
    expect(db.loads).toBe(0);
  });

  it.each(['admin', 'hr'])('gives %s every tracker and the fleet summary', async role => {
    db.session = { role, email: 'someone@x.com' };
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ count: 0, findings: [], fleet: { counts: {}, attention: [] }, trackers: [] });
    expect(db.loads).toBe(1);
  });
});
