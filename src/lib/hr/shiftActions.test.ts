import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Profile, TrackerHeartbeat } from './types';

let pingedWith = '';
let replyWith: (id: string) => { requestId: string } | null = () => null;
let pingFails = false;
let heartbeat: TrackerHeartbeat | null = null;
const log: string[] = [];
const notes: unknown[][] = [];

const actions = {
  clearTrackerPong: vi.fn(async () => { log.push('clearPong'); }),
  clearTrackerPing: vi.fn(async () => { log.push('clearPing'); }),
  writeTrackerPing: vi.fn(async (_e: string, id: string) => { if (pingFails) throw new Error('down'); pingedWith = id; log.push('ping'); }),
  getTrackerPong: vi.fn(async () => replyWith(pingedWith)),
  getTrackerHeartbeat: vi.fn(async () => heartbeat),
  isHeartbeatLive: vi.fn((hb: TrackerHeartbeat | null) => !!hb),
  addNotification: vi.fn(async (...args: unknown[]) => { notes.push(args); }),
};
vi.mock('../hrData', () => ({ hrActions: actions, displayName: (p: { fullName: string }) => p.fullName }));
const { checkTracker, notifyShift } = await import('./shiftActions');

beforeEach(() => { vi.useFakeTimers(); pingedWith = ''; replyWith = () => null; pingFails = false; heartbeat = null; log.length = 0; notes.length = 0; vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

const run = async (p: Promise<unknown>) => { await vi.advanceTimersByTimeAsync(9000); return p; };

describe('checkTracker', () => {
  it('reports the tracker as replied as soon as it answers the ping, and also returns its heartbeat', async () => {
    replyWith = id => ({ requestId: id });
    heartbeat = { agentVersion: '9' } as TrackerHeartbeat;
    const result = await run(checkTracker('a@x.us'));
    expect(result).toMatchObject({ trackerReplied: true, heartbeatLive: true, heartbeat });
  });

  it('gives up after about 8 seconds of real time when nothing answers, and falls back to the heartbeat', async () => {
    heartbeat = { agentVersion: '9' } as TrackerHeartbeat;
    const result = await run(checkTracker('a@x.us'));
    expect(result).toMatchObject({ trackerReplied: false, heartbeatLive: true });
    expect(actions.getTrackerPong.mock.calls.length).toBeGreaterThan(10);
    expect(actions.getTrackerPong.mock.calls.length).toBeLessThanOrEqual(17);
  });

  it('ignores an answer to someone else\'s ping', async () => {
    replyWith = () => ({ requestId: 'not-mine' });
    const result = await run(checkTracker('a@x.us')) as { trackerReplied: boolean };
    expect(result.trackerReplied).toBe(false);
  });

  it('does not block when the ping cannot even be written: it uses the heartbeat', async () => {
    pingFails = true;
    heartbeat = { agentVersion: '9' } as TrackerHeartbeat;
    const result = await run(checkTracker('a@x.us'));
    expect(result).toMatchObject({ trackerReplied: false, heartbeatLive: true });
  });

  it('reports no heartbeat and not live when the tracker is silent', async () => {
    expect(await run(checkTracker('a@x.us'))).toMatchObject({ trackerReplied: false, heartbeat: null, heartbeatLive: false });
  });

  it('always cleans up the ping and the reply', async () => {
    await run(checkTracker('a@x.us'));
    expect(log).toEqual(expect.arrayContaining(['clearPing', 'clearPong']));
  });
});

describe('notifyShift', () => {
  const ali = { email: 'ali@x.us', fullName: 'Ali Example' } as Profile;
  it('tells the employee, then HR, then Admin, with the employee\'s name and email for the push', async () => {
    await notifyShift(ali, 'Shift started.', name => `${name} started shift manually.`);
    expect(notes).toEqual([
      ['ali@x.us', 'employee', 'Shift started.'],
      ['all', 'hr', 'Ali Example started shift manually.', 'shift', 'Ali Example', 'ali@x.us'],
      ['all', 'admin', 'Ali Example started shift manually.', 'shift', 'Ali Example', 'ali@x.us'],
    ]);
  });
});
