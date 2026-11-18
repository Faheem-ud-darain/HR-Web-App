import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMyProfile } from './hr/profiles';

afterEach(() => vi.unstubAllGlobals());
const answer = (status: number, body: string, type = 'application/json') => new Response(body, { status, headers: { 'content-type': type } });

describe('fetchMyProfile', () => {
  it('returns the profile when the server answers with one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(200, '{"profile":{"email":"a@b.us","role":"employee"}}')));
    expect(await fetchMyProfile('t')).toMatchObject({ email: 'a@b.us' });
  });

  it('gives null only for a definite no: not signed in, not allowed, or no such profile', async () => {
    for (const status of [401, 403, 404]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(status, '{}')));
      expect(await fetchMyProfile('t')).toBeNull();
    }
    expect(await fetchMyProfile(null)).toBeNull();
  });

  it('throws, so the query retries, when there was no real answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(fetchMyProfile('t')).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(502, 'bad gateway', 'text/html')));
    await expect(fetchMyProfile('t')).rejects.toThrow(/502/);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(200, '<html>security check</html>', 'text/html')));
    await expect(fetchMyProfile('t')).rejects.toThrow();
  });
});
