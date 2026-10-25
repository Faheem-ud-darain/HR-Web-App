// Regression tests for "tracking switches itself off": a failed read must never be mistaken for
// "no settings row", and saving goes through the server route (which writes only what was sent).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let failReads = false;
const getFullListMock = vi.fn(async () => { if (failReads) throw new Error('502 Bad Gateway'); return []; });
const writeMock = vi.fn();

vi.mock('../pocketbase', () => ({
  pb: { collection: () => ({ getFullList: getFullListMock, update: writeMock, create: writeMock }) },
}));
vi.mock('../hrData', () => ({ hrActions: {}, displayName: () => '' }));
vi.mock('../session', () => ({ getAuthToken: () => 'tok', getSessionEmail: () => 'hr@x.us', getSessionRole: () => 'hr' }));
vi.mock('./shared', () => ({
  pbList: vi.fn(async () => []),
  pbListStrict: async () => getFullListMock(),
  pbCreate: vi.fn(), pbUpdate: vi.fn(), pbUpsertByField: vi.fn(), pbFindByField: vi.fn(), pbDeleteByField: vi.fn(),
  withTimeout: vi.fn(), pbGetTrackerSignal: vi.fn(), pbGetAllTrackerSignals: vi.fn(), pbSetTrackerSignal: vi.fn(), pbClearTrackerSignal: vi.fn(),
  pbClearTrackerSignalFields: vi.fn(), formatDurationBetween: vi.fn(),
}));

import { timesheetActions } from './timesheets';

beforeEach(() => { failReads = false; writeMock.mockClear(); });
afterEach(() => vi.unstubAllGlobals());

describe('reading tracking settings', () => {
  it('throws when the database read fails instead of returning "no row" defaults', async () => {
    failReads = true;
    await expect(timesheetActions.getTrackingSettingsFor('alex@x.us')).rejects.toThrow();
    await expect(timesheetActions.getAllTrackingSettings()).rejects.toThrow();
  });
});

describe('updateTrackingSettings', () => {
  it('posts to the server route with only the requested fields and never writes from the browser', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ settings: { employeeEmail: 'alex@x.us', enabled: true, intervalMinutes: 5, excludeFromAutoDelete: false, agentToken: 'agt_x', id: 'r1' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await timesheetActions.updateTrackingSettings('alex@x.us', { agentToken: 'agt_new1234567' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/tracking/settings');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'alex@x.us', updates: { agentToken: 'agt_new1234567' } });
    expect(writeMock).not.toHaveBeenCalled();
    expect(out).toMatchObject({ enabled: true, agentToken: 'agt_x' });
  });

  it('surfaces a server failure as an error (nothing was changed)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Could not reach the database. Nothing was changed.' }), { status: 502 })));
    await expect(timesheetActions.updateTrackingSettings('alex@x.us', {})).rejects.toThrow(/Nothing was changed/);
  });
});
