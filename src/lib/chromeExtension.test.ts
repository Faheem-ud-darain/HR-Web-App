import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { getCaptureGap } from './core/timesheets';

// The Chromebook extension is plain JavaScript that runs inside Chrome, so only its pure helpers (chrome-extension/capture-health.js)
// can be tested here. They decide what the heartbeat tells the dashboard about screenshots.
const require = createRequire(import.meta.url);
const { buildHeartbeat, afterCapture, CAPTURE_REASONS } = require('../../chrome-extension/capture-health.js') as {
  buildHeartbeat: (a: Record<string, unknown>) => Record<string, unknown>;
  afterCapture: (stored: Record<string, unknown>, outcome: { ok: boolean; reason?: string }, nowMs: number) => Record<string, unknown>;
  CAPTURE_REASONS: { noFrame: string; noConnection: string; uploadRejected: (status: number) => string };
};

const base = { email: 'grace@x.com', deviceId: 'chromebook_grace', connectedAt: '2026-11-02T08:00:00.000Z', nowIso: '2026-11-02T12:00:00.000Z', version: '1.0.18' };
const NOW = Date.parse('2026-11-02T12:00:00.000Z');

describe('buildHeartbeat', () => {
  it('reports when the last screenshot arrived, so the dashboard can tell the tracker reports captures', () => {
    const hb = buildHeartbeat({ ...base, stored: { shiftActive: true, lastUploadedAt: NOW - 5 * 60 * 1000 } });
    expect(hb.lastCaptureAt).toBe(new Date(NOW - 5 * 60 * 1000).toISOString());
    expect(hb.captureEnabled).toBe(true);
    expect(hb.agentVersion).toBe('1.0.18');
    expect(hb.deviceLabel).toBe('Chromebook / Chrome OS');
  });

  it('always sends captureEnabled as a boolean, even with no shift and nothing stored yet', () => {
    const hb = buildHeartbeat({ ...base, stored: {} });
    expect(hb.captureEnabled).toBe(false);
    expect(hb.lastCaptureAt).toBeNull();
    expect(hb.lastCaptureError).toBeNull();
    expect(hb.consecutiveCaptureFailures).toBe(0);
  });

  it('carries the reason and the streak of failed captures', () => {
    const hb = buildHeartbeat({ ...base, stored: { shiftActive: true, lastCaptureError: CAPTURE_REASONS.noFrame, captureFailures: 3 } });
    expect(hb.lastCaptureError).toBe(CAPTURE_REASONS.noFrame);
    expect(hb.consecutiveCaptureFailures).toBe(3);
  });

  it('makes the dashboard alert work for a Chromebook that stopped capturing', () => {
    const hb = buildHeartbeat({ ...base, stored: { shiftActive: true, lastUploadedAt: NOW - 90 * 60 * 1000 } }) as { lastCaptureAt: string; captureEnabled: boolean };
    const gap = getCaptureGap({
      onShift: true, trackingOn: true, heartbeatLive: true, lastCaptureAt: hb.lastCaptureAt, shiftStartedAt: '2026-11-02T08:00:00.000Z',
      intervalMinutes: 15, now: NOW, captureReported: hb.captureEnabled !== undefined,
    });
    expect(gap).toEqual({ status: 'no_captures', minutes: 90 });
  });
});

describe('afterCapture', () => {
  it('a success records the time and clears the error and the streak', () => {
    expect(afterCapture({ lastCaptureError: 'old', captureFailures: 4 }, { ok: true }, NOW)).toEqual({ lastUploadedAt: NOW, lastCaptureError: null, captureFailures: 0 });
  });

  it('a failure counts up with its reason and keeps the last good time untouched', () => {
    const first = afterCapture({}, { ok: false, reason: CAPTURE_REASONS.noConnection }, NOW);
    expect(first).toEqual({ lastCaptureError: CAPTURE_REASONS.noConnection, captureFailures: 1 });
    expect(first).not.toHaveProperty('lastUploadedAt');
    expect(afterCapture({ captureFailures: 1 }, { ok: false, reason: CAPTURE_REASONS.uploadRejected(403) }, NOW).captureFailures).toBe(2);
  });

  it('names the HTTP status when the server refuses a screenshot', () => {
    expect(CAPTURE_REASONS.uploadRejected(413)).toContain('413');
  });
});
