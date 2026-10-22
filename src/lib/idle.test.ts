import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IDLE_AFTER_MS, IDLE_FACTOR, idleFactor, isUserIdle, every, setAdaptiveInterval, __setLastActivityForTests } from './idle';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-19T12:00:00Z')); __setLastActivityForTests(Date.now()); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('idle detection', () => {
  it('is active until two minutes without input, then 3x slower', () => {
    expect(isUserIdle()).toBe(false);
    expect(idleFactor()).toBe(1);
    vi.advanceTimersByTime(IDLE_AFTER_MS - 1);
    expect(idleFactor()).toBe(1);
    vi.advanceTimersByTime(2);
    expect(isUserIdle()).toBe(true);
    expect(idleFactor()).toBe(IDLE_FACTOR);
  });
  it('every() follows the current state', () => {
    const poll = every(30_000);
    expect(poll()).toBe(30_000);
    vi.advanceTimersByTime(IDLE_AFTER_MS + 1);
    expect(poll()).toBe(90_000);
  });
});

describe('setAdaptiveInterval', () => {
  it('ticks at the base rate while active and stops when cancelled', () => {
    const fn = vi.fn();
    const stop = setAdaptiveInterval(fn, 5_000);
    vi.advanceTimersByTime(15_000);
    expect(fn).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(30_000);
    expect(fn).toHaveBeenCalledTimes(3);
  });
  it('slows to a third once the person goes idle', () => {
    const fn = vi.fn();
    const stop = setAdaptiveInterval(fn, 5_000);
    vi.advanceTimersByTime(IDLE_AFTER_MS + 1_000); // ~24 ticks while active
    const before = fn.mock.calls.length;
    fn.mockClear();
    vi.advanceTimersByTime(60_000);                // idle: 15s per tick -> 4 ticks
    expect(before).toBeGreaterThan(20);
    expect(fn.mock.calls.length).toBeLessThanOrEqual(4);
    stop();
  });
  it('skips ticks while the tab is hidden, and resumes after', () => {
    const fn = vi.fn();
    vi.stubGlobal('document', { visibilityState: 'hidden' });
    const stop = setAdaptiveInterval(fn, 5_000);
    vi.advanceTimersByTime(20_000);
    expect(fn).not.toHaveBeenCalled();
    vi.stubGlobal('document', { visibilityState: 'visible' });
    vi.advanceTimersByTime(5_000);
    expect(fn).toHaveBeenCalledTimes(1);
    stop();
  });
  it('lets the base interval change per tick (quiet-channel backoff)', () => {
    const fn = vi.fn();
    let base = 5_000;
    const stop = setAdaptiveInterval(fn, () => base);
    vi.advanceTimersByTime(5_000);
    expect(fn).toHaveBeenCalledTimes(1);
    base = 15_000;
    vi.advanceTimersByTime(5_000);   // the tick already scheduled at 5s still fires...
    vi.advanceTimersByTime(14_000);  // ...then the next one waits the longer 15s
    expect(fn).toHaveBeenCalledTimes(2);
    stop();
  });
});
