// Regression test for the "tracking switches itself off" bug: updateTrackingSettings used to build its
// write from a read that swallows errors, so a PocketBase hiccup made an existing row look missing and the
// first-time defaults (enabled: false + a new random agentToken) overwrote it.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = { id: string; employeeEmail: string; enabled: boolean; intervalMinutes: number; excludeFromAutoDelete: boolean; agentToken: string };
let rows: Row[] = [];
let failReads = false;
const updateMock = vi.fn(async (id: string, data: Partial<Row>) => { const r = rows.find(x => x.id === id)!; Object.assign(r, data); return { ...r }; });
const createMock = vi.fn(async (data: Omit<Row, 'id'>) => { const r = { id: 'new', ...data } as Row; rows.push(r); return { ...r }; });

vi.mock('../pocketbase', () => ({
  pb: {
    collection: () => ({
      getFullList: async () => { if (failReads) throw new Error('502 Bad Gateway'); return rows.map(r => ({ ...r })); },
      update: updateMock,
      create: createMock,
    }),
  },
}));
vi.mock('../hrData', () => ({ hrActions: {}, displayName: () => '' }));
vi.mock('./shared', () => ({
  pbList: vi.fn(async () => []), pbCreate: vi.fn(), pbUpdate: vi.fn(), pbUpsertByField: vi.fn(), pbFindByField: vi.fn(), pbDeleteByField: vi.fn(),
  withTimeout: vi.fn(), pbGetTrackerSignal: vi.fn(), pbGetAllTrackerSignals: vi.fn(), pbSetTrackerSignal: vi.fn(), pbClearTrackerSignal: vi.fn(),
  pbClearTrackerSignalFields: vi.fn(), formatDurationBetween: vi.fn(),
}));

import { timesheetActions } from './timesheets';

beforeEach(() => {
  rows = [{ id: 'r1', employeeEmail: 'alex@x.us', enabled: true, intervalMinutes: 5, excludeFromAutoDelete: false, agentToken: 'agt_keepme' }];
  failReads = false;
  updateMock.mockClear(); createMock.mockClear();
});

describe('updateTrackingSettings', () => {
  it('writes nothing when the read fails (never falls back to first-time defaults)', async () => {
    failReads = true;
    await expect(timesheetActions.updateTrackingSettings('alex@x.us', {})).rejects.toThrow();
    expect(updateMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ enabled: true, agentToken: 'agt_keepme' });
  });

  it('only sends the fields the caller passed, so regenerating a token cannot turn tracking off', async () => {
    await timesheetActions.updateTrackingSettings('alex@x.us', { agentToken: 'agt_new' });
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(Object.keys(updateMock.mock.calls[0][1]).sort()).toEqual(['agentToken', 'employeeEmail']);
    expect(rows[0]).toMatchObject({ enabled: true, intervalMinutes: 5, agentToken: 'agt_new' });
  });

  it('does not touch an existing row for an empty update', async () => {
    const out = await timesheetActions.updateTrackingSettings('Alex@X.us', {});
    expect(updateMock).not.toHaveBeenCalled();
    expect(out).toMatchObject({ enabled: true, agentToken: 'agt_keepme' });
  });

  it('applies defaults and a new token only when the employee really has no row', async () => {
    const out = await timesheetActions.updateTrackingSettings('new@x.us', {});
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ enabled: false, intervalMinutes: 15 });
    expect(out.agentToken).toMatch(/^agt_/);
  });
});
