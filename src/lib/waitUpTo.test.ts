import { describe, expect, it } from 'vitest';
import { waitUpTo } from './waitUpTo';

describe('waitUpTo', () => {
  it('returns as soon as every job is done', async () => {
    const started = Date.now();
    await waitUpTo([Promise.resolve(1), new Promise(r => setTimeout(r, 10))], 2000);
    expect(Date.now() - started).toBeLessThan(500);
  });
  it('does not wait longer than the limit for a job that hangs', async () => {
    const started = Date.now();
    await waitUpTo([new Promise(() => {})], 50);
    expect(Date.now() - started).toBeLessThan(500);
  });
  it('never throws, even when jobs fail', async () => {
    await expect(waitUpTo([Promise.reject(new Error('x')), Promise.resolve(2)], 100)).resolves.toBeUndefined();
  });
  it('lets a slow job finish in the background after the limit', async () => {
    let done = false;
    await waitUpTo([new Promise<void>(r => setTimeout(() => { done = true; r(); }, 80))], 10);
    expect(done).toBe(false);
    await new Promise(r => setTimeout(r, 150));
    expect(done).toBe(true);
  });
});
