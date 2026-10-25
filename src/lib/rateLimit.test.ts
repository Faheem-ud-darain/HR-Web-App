import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('./pbAdmin', () => ({
  adminFindByField: async (_c: string, _f: string, key: string) => (store.has(key) ? { data: store.get(key) } : null),
  adminUpsertByField: async (_c: string, _f: string, key: string, data: unknown) => { store.set(key, data); },
  rememberAdminUpsertId: () => {},
}));

import { getClientIp, rateLimitByIp, tooManyRequests } from './rateLimit';

const req = (headers: Record<string, string> = {}) => new Request('https://x.test/api', { headers });

beforeEach(() => store.clear());

describe('getClientIp', () => {
  it('prefers Cloudflare\'s header over a client-supplied forwarded-for', () => {
    expect(getClientIp(req({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.2.3.4');
  });
  it('falls back to the first forwarded-for hop, then x-real-ip', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' }))).toBe('5.6.7.8');
    expect(getClientIp(req({ 'x-real-ip': '8.8.4.4' }))).toBe('8.8.4.4');
  });
  it('returns null when it cannot tell', () => expect(getClientIp(req())).toBeNull());
});

describe('rateLimitByIp', () => {
  it('allows up to the limit, then answers 429 with Retry-After', async () => {
    const r = req({ 'cf-connecting-ip': '1.2.3.4' });
    for (let i = 0; i < 3; i++) expect(await rateLimitByIp(r, 'test', 3, 60_000)).toBeNull();
    const blocked = await rateLimitByIp(r, 'test', 3, 60_000);
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get('Retry-After'))).toBeGreaterThan(0);
  });
  it('keeps addresses and scopes separate', async () => {
    const a = req({ 'cf-connecting-ip': '1.1.1.1' });
    const b = req({ 'cf-connecting-ip': '2.2.2.2' });
    await rateLimitByIp(a, 'login', 1, 60_000);
    expect((await rateLimitByIp(a, 'login', 1, 60_000))?.status).toBe(429);
    expect(await rateLimitByIp(b, 'login', 1, 60_000)).toBeNull();
    expect(await rateLimitByIp(a, 'other', 1, 60_000)).toBeNull();
  });
  it('does not throttle callers whose address is unknown', async () => {
    for (let i = 0; i < 50; i++) expect(await rateLimitByIp(req(), 'test', 1, 60_000)).toBeNull();
  });
  it('lets the window expire', async () => {
    vi.useFakeTimers();
    const r = req({ 'cf-connecting-ip': '3.3.3.3' });
    await rateLimitByIp(r, 'win', 1, 1000);
    expect((await rateLimitByIp(r, 'win', 1, 1000))?.status).toBe(429);
    vi.advanceTimersByTime(1500);
    expect(await rateLimitByIp(r, 'win', 1, 1000)).toBeNull();
    vi.useRealTimers();
  });
});

describe('tooManyRequests', () => {
  it('rounds the wait up to whole minutes in the message', async () => {
    const res = tooManyRequests(61);
    expect((await res.json()).error).toContain('2 minutes');
  });
});
