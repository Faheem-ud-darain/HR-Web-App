import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitUpTo } from './waitUpTo';

afterEach(() => vi.useRealTimers());

// Controlled timers: nothing here depends on how fast the machine runs.
describe('waitUpTo', () => {
  it('keeps waiting while a job is pending, and returns once it is done', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const job = new Promise<void>(r => { finish = r; });
    let returned = false;
    const waiting = waitUpTo([job], 2000).then(() => { returned = true; });
    await vi.advanceTimersByTimeAsync(1500);
    expect(returned).toBe(false); // still before the limit and the job is not done
    finish();
    await waiting;
    expect(returned).toBe(true);
  });
  it('gives up at the limit for a job that hangs, and not before', async () => {
    vi.useFakeTimers();
    let returned = false;
    const waiting = waitUpTo([new Promise(() => {})], 50).then(() => { returned = true; });
    await vi.advanceTimersByTimeAsync(49);
    expect(returned).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(returned).toBe(true);
  });
  it('never throws, even when jobs fail', async () => {
    await expect(waitUpTo([Promise.reject(new Error('x')), Promise.resolve(2)], 100)).resolves.toBeUndefined();
  });
  it('lets a slow job finish in the background after the limit', async () => {
    vi.useFakeTimers();
    let done = false;
    const waiting = waitUpTo([new Promise<void>(r => setTimeout(() => { done = true; r(); }, 80))], 10);
    await vi.advanceTimersByTimeAsync(10);
    await waiting;
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(done).toBe(true);
  });
});
