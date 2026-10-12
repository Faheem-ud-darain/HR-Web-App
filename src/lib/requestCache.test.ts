import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { coalesce, invalidateCache } from './requestCache';

beforeEach(() => { vi.useFakeTimers(); invalidateCache(''); });
afterEach(() => { vi.useRealTimers(); });

describe('coalesce', () => {
  it('shares one in-flight request between concurrent callers', async () => {
    const load = vi.fn(async () => 'data');
    const results = await Promise.all([coalesce('k', 1000, load), coalesce('k', 1000, load), coalesce('k', 1000, load)]);
    expect(results).toEqual(['data', 'data', 'data']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reuses the result within the ttl and reloads after it', async () => {
    const load = vi.fn(async () => 'v');
    await coalesce('k', 1000, load);
    vi.advanceTimersByTime(999);
    await coalesce('k', 1000, load);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2);
    await coalesce('k', 1000, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps different keys independent and invalidates by prefix', async () => {
    const a = vi.fn(async () => 'a');
    const b = vi.fn(async () => 'b');
    await coalesce('idset:x:1', 1000, a);
    await coalesce('readmap:y', 1000, b);
    invalidateCache('idset:');
    await coalesce('idset:x:1', 1000, a);
    await coalesce('readmap:y', 1000, b);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('does not cache failures', async () => {
    const load = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok');
    await expect(coalesce('k', 1000, load)).rejects.toThrow('boom');
    await expect(coalesce('k', 1000, load)).resolves.toBe('ok');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
