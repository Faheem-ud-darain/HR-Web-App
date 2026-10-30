import { describe, it, expect } from 'vitest';
import { shiftStartBlock } from './shiftStart';
import { TRACKER_MIN_VERSION } from '../trackerSetup';
import type { TrackerHeartbeat } from '../hr/types';

const hb = (over: Partial<TrackerHeartbeat> = {}): TrackerHeartbeat => ({ agentVersion: TRACKER_MIN_VERSION, captureEnabled: true, ...over }) as TrackerHeartbeat;
const base = { mobile: false, tracked: true, trackerReplied: true, heartbeat: hb(), heartbeatLive: true };

describe('shiftStartBlock', () => {
  it('lets an untracked employee start from a computer', () => {
    expect(shiftStartBlock({ ...base, tracked: false, trackerReplied: false, heartbeat: null, heartbeatLive: false })).toBeNull();
  });
  it('never lets a phone or tablet start a shift, tracked or not', () => {
    expect(shiftStartBlock({ ...base, mobile: true })).toBe('mobile');
    expect(shiftStartBlock({ ...base, mobile: true, tracked: false })).toBe('mobile');
  });
  it('lets a tracked employee start when the tracker answered and is current', () => {
    expect(shiftStartBlock(base)).toBeNull();
  });
  it('lets a tracked employee start on a live heartbeat even when the tracker did not answer', () => {
    expect(shiftStartBlock({ ...base, trackerReplied: false })).toBeNull();
  });
  it('blocks when the tracker neither answered nor has a live heartbeat', () => {
    expect(shiftStartBlock({ ...base, trackerReplied: false, heartbeatLive: false })).toBe('tracker_missing');
    expect(shiftStartBlock({ ...base, trackerReplied: false, heartbeat: null, heartbeatLive: false })).toBe('tracker_missing');
  });
  it('blocks a tracker running a build older than the minimum', () => {
    expect(shiftStartBlock({ ...base, heartbeat: hb({ agentVersion: '0.0.1' }) })).toBe('tracker_outdated');
  });
  it('blocks a current tracker that still uses an old setup code', () => {
    expect(shiftStartBlock({ ...base, heartbeat: hb({ captureEnabled: false, lastCaptureError: 'Setup token not recognized' }) })).toBe('tracker_reconnect');
  });
});
