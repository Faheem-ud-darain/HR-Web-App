import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry, isNetworkFailure } from './fetchRetry';

afterEach(() => vi.unstubAllGlobals());

describe('fetchWithRetry', () => {
  it('retries once after a dropped connection and returns the second answer', async () => {
    const ok = new Response('{}', { status: 200 });
    const f = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok);
    vi.stubGlobal('fetch', f);
    const res = await fetchWithRetry('/x', {}, { delayMs: 0 });
    expect(res).toBe(ok);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('never retries an HTTP answer, even an error one', async () => {
    const f = vi.fn().mockResolvedValue(new Response('{"error":"Invalid email or password."}', { status: 401 }));
    vi.stubGlobal('fetch', f);
    const res = await fetchWithRetry('/x', {}, { delayMs: 0 });
    expect(res.status).toBe(401);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retries and throws the last network error', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', f);
    await expect(fetchWithRetry('/x', {}, { delayMs: 0, retries: 1 })).rejects.toThrow('Failed to fetch');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('does not retry an error that is not a network failure', async () => {
    const f = vi.fn().mockRejectedValue(new RangeError('bug'));
    vi.stubGlobal('fetch', f);
    await expect(fetchWithRetry('/x', {}, { delayMs: 0 })).rejects.toThrow('bug');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('knows a network failure when it sees one', () => {
    expect(isNetworkFailure(new TypeError('x'))).toBe(true);
    expect(isNetworkFailure(Object.assign(new Error('t'), { name: 'TimeoutError' }))).toBe(true);
    expect(isNetworkFailure(new RangeError('x'))).toBe(false);
  });
});
