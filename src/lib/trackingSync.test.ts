import { beforeEach, describe, expect, it, vi } from 'vitest';

// The one place that makes hr_profiles.tracking_enabled equal to hr_tracking_settings.enabled. The database helpers are replaced.
const db = vi.hoisted(() => ({ profile: null as Record<string, unknown> | null, writes: [] as { id: string; fields: Record<string, unknown> }[], failFind: false, failWrite: false }));

vi.mock('@/lib/pbAdmin', () => ({
  adminFindProfileByEmail: async () => { if (db.failFind) throw new Error('database down'); return db.profile; },
  adminUpdateProfile: async (id: string, fields: Record<string, unknown>) => { if (db.failWrite) throw new Error('write refused'); db.writes.push({ id, fields }); },
}));

import { syncProfileTrackingFlag } from './trackingSync';

beforeEach(() => { db.profile = { id: 'p1', email: 'a@x.com', tracking_enabled: false }; db.writes = []; db.failFind = false; db.failWrite = false; vi.spyOn(console, 'error').mockImplementation(() => undefined); });

describe('syncProfileTrackingFlag', () => {
  it('makes the profile copy equal to the switch, in both directions', async () => {
    expect(await syncProfileTrackingFlag('a@x.com', true)).toBe(true);
    expect(db.writes).toEqual([{ id: 'p1', fields: { tracking_enabled: true } }]);
    db.writes = []; db.profile = { id: 'p1', email: 'a@x.com', tracking_enabled: true };
    expect(await syncProfileTrackingFlag('a@x.com', false)).toBe(true);
    expect(db.writes).toEqual([{ id: 'p1', fields: { tracking_enabled: false } }]);
  });

  it('writes nothing when the copy already matches', async () => {
    expect(await syncProfileTrackingFlag('a@x.com', false)).toBe(true);
    expect(db.writes).toEqual([]);
  });

  it('says false, and never throws, when there is no profile or the database fails', async () => {
    db.profile = null;
    expect(await syncProfileTrackingFlag('a@x.com', true)).toBe(false);
    db.profile = { id: 'p1', tracking_enabled: false }; db.failWrite = true;
    expect(await syncProfileTrackingFlag('a@x.com', true)).toBe(false);
    db.failFind = true;
    expect(await syncProfileTrackingFlag('a@x.com', true)).toBe(false);
  });
});
