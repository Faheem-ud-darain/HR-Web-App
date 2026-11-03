import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCaptureHealth, hasStaleTrackerToken } from './core/timesheets';
import type { TrackerHeartbeat } from './hr/types';

// Runs the REAL chrome-extension/background.js in a sandbox with a fake Chrome and a fake network, so what the extension actually
// sends to the server is checked, not only its helper functions. Nothing here can reach a real server.
const DIR = path.resolve(__dirname, '../../chrome-extension');
const read = (f: string) => fs.readFileSync(path.join(DIR, f), 'utf8');

const EMAIL = 'grace@x.com';
const OPEN_SHIFT = { id: 's1', employee_id: EMAIL, clock_in: new Date(Date.now() - 3 * 3600 * 1000).toISOString() };
type Call = { url: string; method: string; body: Record<string, unknown> | null };

interface World { store: Record<string, unknown>; calls: Call[]; settings: Record<string, unknown> | null; uploadStatus: number | null; frame: Record<string, unknown> | null }
const world: World = { store: {}, calls: [], settings: null, uploadStatus: 200, frame: null };

function loadExtension() {
  const store = world.store; // this extension's own storage: work it leaves running after its test ends cannot write into the next test's
  const deep = (): unknown => new Proxy(function () { /* any other chrome API: does nothing */ }, { get: () => deep(), apply: () => undefined });
  // Anything the extension touches that this test does not care about (listeners, idle, notifications...) quietly does nothing.
  const lenient = (o: Record<string, unknown>) => new Proxy(o, { get: (t, k: string) => (k in t ? t[k] : deep()) });
  const chrome = lenient({
    alarms: lenient({ create() { /* */ }, onAlarm: { addListener() { /* */ } } }),
    storage: {
      local: {
        get: (keys: string[], cb: (v: Record<string, unknown>) => void) => cb(Object.fromEntries(keys.filter(k => k in store).map(k => [k, store[k]]))),
        set: (obj: Record<string, unknown>, cb?: () => void) => { Object.assign(store, obj); cb?.(); },
        clear() { /* */ },
      },
    },
    runtime: lenient({ getManifest: () => ({ version: '1.0.16' }), sendMessage: (_m: unknown, cb: (r: unknown) => void) => cb(world.frame), lastError: undefined }),
    tabs: lenient({ query: (_q: unknown, cb: (t: unknown[]) => void) => cb([]), captureVisibleTab: (_w: unknown, _o: unknown, cb: (u?: string) => void) => cb(undefined) }),
  });

  const respond = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });
  const fetchFake = async (url: string, init: { method?: string; body?: unknown } = {}) => {
    const method = init.method || 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    world.calls.push({ url, method, body });
    if (url.includes('/hr_timesheets/')) return respond({ items: [OPEN_SHIFT] });
    if (url.includes('/hr_tracking_settings/')) return respond({ items: world.settings ? [world.settings] : [] });
    if (url.includes('/hr_screenshots/')) return world.uploadStatus === null ? Promise.reject(new Error('offline')) : respond({}, world.uploadStatus < 400, world.uploadStatus);
    return respond({ items: [] }); // hr_tracker_signals: no existing row, no ping, no command
  };

  const ctx = vm.createContext({ chrome, fetch: fetchFake, console: { log() { /* */ }, warn() { /* */ }, error() { /* */ } }, setTimeout, clearTimeout, setInterval, clearInterval, FormData, Blob, atob, URL });
  (ctx as Record<string, unknown>).importScripts = (f: string) => vm.runInContext(read(f), ctx);
  // The worker starts a heartbeat tick the moment it loads. Start it with nothing configured, then set the account up, so the only
  // ticks in a test are the ones the test runs.
  const configured = { ...store };
  for (const k of Object.keys(store)) delete store[k];
  vm.runInContext(read('background.js'), ctx);
  Object.assign(store, configured);
  return ctx as unknown as { handleHeartbeatTick: () => Promise<void>; handleScreenshotTick: () => Promise<void> };
}

// The tick finishes its heartbeat upload first; later steps may wait on Chrome APIs the fake does not answer, so do not wait for them.
const settle = (p: Promise<unknown>) => Promise.race([p, new Promise(r => setTimeout(r, 250))]);
const heartbeatSent = (): TrackerHeartbeat => {
  const hb = world.calls.filter(c => c.url.includes('/hr_tracker_signals/') && c.method !== 'GET' && c.body && 'heartbeat' in c.body && c.body.heartbeat).at(-1);
  expect(hb, 'a heartbeat was sent').toBeTruthy();
  return hb!.body!.heartbeat as TrackerHeartbeat;
};

beforeEach(() => {
  world.store = { employeeEmail: EMAIL, agentToken: 'tok', serverUrl: 'https://pb.test', deviceId: 'd1', shiftActive: true };
  world.calls = []; world.settings = { enabled: true, intervalMinutes: 15 }; world.uploadStatus = 200; world.frame = null;
});

describe('the Chromebook extension as it actually runs', () => {
  it('reports the last confirmed upload and that it is capturing', async () => {
    const lastUploadedAt = Date.now() - 4 * 60 * 1000;
    Object.assign(world.store, { lastUploadedAt });
    await settle(loadExtension().handleHeartbeatTick());
    const hb = heartbeatSent();
    expect(hb.lastCaptureAt).toBe(new Date(lastUploadedAt).toISOString());
    expect(hb.captureEnabled).toBe(true);
    expect(hb.agentVersion).toBe('1.0.16');
    expect(getCaptureHealth(hb).status).toBe('ok');
  });

  it('does not count an ATTEMPTED capture as a capture, so a failing tracker is not hidden', async () => {
    Object.assign(world.store, { lastScreenshotTime: Date.now() }); // set when a capture is attempted, before it is known to work
    await settle(loadExtension().handleHeartbeatTick());
    expect(heartbeatSent().lastCaptureAt).toBeNull();
  });

  it('an old setup code is reported as such on the next heartbeat, not as a vague "no screenshots"', async () => {
    world.settings = null; // the server does not recognise this device's code any more
    const ext = loadExtension();
    await settle(ext.handleHeartbeatTick());
    expect(world.store.captureBlocked).toBe('token');
    world.calls = [];
    await settle(ext.handleHeartbeatTick());
    const hb = heartbeatSent();
    expect(hb.captureEnabled).toBe(false);
    expect(hasStaleTrackerToken(hb)).toBe(true);
    expect(getCaptureHealth(hb).status).toBe('stale_token');
  });

  it('tracking switched off by HR is reported as not capturing, and clears once it is switched back on', async () => {
    world.settings = { enabled: false, intervalMinutes: 15 };
    const ext = loadExtension();
    await settle(ext.handleHeartbeatTick());
    expect(world.store).toMatchObject({ captureBlocked: 'disabled', lastCaptureError: null });
    world.settings = { enabled: true, intervalMinutes: 15 };
    await settle(ext.handleHeartbeatTick());
    expect(world.store.captureBlocked).toBeNull();
  });

  it('a screenshot that cannot be taken is recorded with its reason, and counted', async () => {
    const ext = loadExtension();
    await ext.handleScreenshotTick();
    await vi.waitFor(() => expect(world.store.captureFailures).toBe(1));
    expect(world.store.lastCaptureError).toMatch(/Could not capture the screen/);
    expect(world.store.lastUploadedAt).toBeUndefined();
    world.calls = [];
    await settle(ext.handleHeartbeatTick());
    expect(heartbeatSent()).toMatchObject({ consecutiveCaptureFailures: 1, lastCaptureAt: null });
  });

  it('a screenshot the server refuses is recorded with the status, and one that uploads clears the problem', async () => {
    world.frame = { success: true, dataUrl: 'data:image/jpeg;base64,AAAA', width: 1920, height: 1080 };
    const ext = loadExtension();
    world.uploadStatus = 403;
    await ext.handleScreenshotTick();
    await vi.waitFor(() => expect(world.store.lastCaptureError).toMatch(/HTTP 403/));
    expect(world.store.captureFailures).toBe(1);

    world.uploadStatus = null; // no connection
    await ext.handleScreenshotTick();
    await vi.waitFor(() => expect(world.store.lastCaptureError).toMatch(/no connection/));
    expect(world.store.captureFailures).toBe(2);

    world.uploadStatus = 200;
    await ext.handleScreenshotTick();
    await vi.waitFor(() => expect(world.store.captureFailures).toBe(0));
    expect(world.store.lastCaptureError).toBeNull();
    expect(typeof world.store.lastUploadedAt).toBe('number');
  });
});
