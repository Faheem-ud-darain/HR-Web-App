import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Profile, TrackerHeartbeat } from './types';

let pingedWith = '';
let replyWith: (id: string) => { requestId: string } | null = () => null;
let pingFails = false;
let heartbeatFails = false;
let heartbeat: TrackerHeartbeat | null = null;
const log: string[] = [];
const notes: unknown[][] = [];

const actions = {
  clearTrackerPong: vi.fn(async () => { log.push('clearPong'); }),
  clearTrackerPing: vi.fn(async () => { log.push('clearPing'); }),
  writeTrackerPing: vi.fn(async (_e: string, id: string) => { if (pingFails) throw new Error('down'); pingedWith = id; log.push('ping'); }),
  getTrackerPong: vi.fn(async () => replyWith(pingedWith)),
  getTrackerHeartbeatStrict: vi.fn(async () => { if (heartbeatFails) throw new Error('network'); return heartbeat; }),
  clockIn: vi.fn(),
  clockOut: vi.fn(),
  isHeartbeatLive: vi.fn((hb: TrackerHeartbeat | null) => !!hb),
  addNotification: vi.fn(async (...args: unknown[]) => { notes.push(args); }),
};
vi.mock('../hrData', () => ({ hrActions: actions, displayName: (p: { fullName: string }) => p.fullName }));
const { checkTracker, notifyShift, withOneRetry, confirmedClockIn, confirmedClockOut } = await import('./shiftActions');

beforeEach(() => { vi.useFakeTimers(); pingedWith = ''; replyWith = () => null; pingFails = false; heartbeatFails = false; heartbeat = null; log.length = 0; notes.length = 0; vi.clearAllMocks(); });
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

  it('says the heartbeat READ failed (not that the tracker is missing) when the server cannot be reached', async () => {
    heartbeatFails = true;
    expect(await run(checkTracker('a@x.us'))).toMatchObject({ trackerReplied: false, heartbeat: null, heartbeatLive: false, heartbeatReadFailed: true });
  });

  it('does not flag a read failure when the read worked', async () => {
    expect(await run(checkTracker('a@x.us'))).toMatchObject({ heartbeatReadFailed: false });
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

describe('withOneRetry', () => {
  it('returns the second answer after one failure', async () => {
    const attempt = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce('ok');
    const result = withOneRetry(attempt, 10);
    await vi.advanceTimersByTimeAsync(20);
    expect(await result).toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(2);
  });
  it('throws after the retry also fails, so the caller can tell the employee it was not confirmed', async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('offline'));
    const result = withOneRetry(attempt, 10);
    const settled = result.catch(e => e);
    await vi.advanceTimersByTimeAsync(20);
    expect(await settled).toMatchObject({ message: 'offline' });
    expect(attempt).toHaveBeenCalledTimes(2);
  });
  it('does not retry a success', async () => {
    const attempt = vi.fn().mockResolvedValue(1);
    await withOneRetry(attempt, 10);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});

describe('confirmedClockIn / confirmedClockOut', () => {
  it('only resolve once the server has answered', async () => {
    actions.clockIn.mockResolvedValue({ id: 's1', clockIn: 'now' });
    actions.clockOut.mockResolvedValue(null);
    expect(await confirmedClockIn('a@b.us')).toEqual({ id: 's1', clockIn: 'now' });
    expect(await confirmedClockOut('a@b.us')).toBeNull();
  });
  it('reject when the server never answers, instead of pretending the shift started or ended', async () => {
    actions.clockIn.mockRejectedValue(new Error('timeout'));
    actions.clockOut.mockRejectedValue(new Error('timeout'));
    const a = confirmedClockIn('a@b.us').catch(e => e);
    const b = confirmedClockOut('a@b.us').catch(e => e);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await a).toMatchObject({ message: 'timeout' });
    expect(await b).toMatchObject({ message: 'timeout' });
  });
});
