import { describe, expect, it } from 'vitest';
import { buildIntegrityReport } from './trackingSettings';

describe('flag_mismatch findings', () => {
  const settings = (enabled: boolean) => [{ employeeEmail: 'a@x.com', enabled, intervalMinutes: 15, agentToken: 'tok' }];
  const run = (profileOn: boolean, settingsOn: boolean) => buildIntegrityReport({
    profiles: [{ email: 'a@x.com', role: 'employee', trackingEnabled: profileOn }], settings: settings(settingsOn), openShifts: [], heartbeats: {},
  });

  it('carries what the real switch says, so a repair knows which way to copy', () => {
    expect(run(false, true)).toEqual([expect.objectContaining({ kind: 'flag_mismatch', settingsEnabled: true })]);
    expect(run(true, false)).toEqual([expect.objectContaining({ kind: 'flag_mismatch', settingsEnabled: false })]);
  });

  it('reports nothing when the two copies agree', () => {
    expect(run(true, true)).toEqual([]);
    expect(run(false, false)).toEqual([]);
  });
});
