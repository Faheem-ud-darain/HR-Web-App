import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  process.env.PB_ADMIN_EMAIL = 'a@x.us';
  process.env.PB_ADMIN_PASSWORD = 'pw';
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function load(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  return await import('./pbAdmin');
}

describe('pbAdminFetch', () => {
  it('gives every call to PocketBase a time limit', async () => {
    const calls: RequestInit[] = [];
    const { pbAdminFetch } = await load(async (url, init) => { calls.push(init || {}); return url.includes('auth-with-password') ? json({ token: 't' }) : json({ ok: true }); });
    await pbAdminFetch('/api/collections/hr_profiles/records?perPage=1');
    expect(calls.length).toBe(2);
    expect(calls.every(c => c.signal)).toBe(true);
  });

  it('repeats a read once after a dropped connection', async () => {
    let reads = 0;
    const { pbAdminFetch } = await load(async url => {
      if (url.includes('auth-with-password')) return json({ token: 't' });
      reads++;
      if (reads === 1) throw new TypeError('Failed to fetch');
      return json({ items: [1] });
    });
    expect(await pbAdminFetch('/api/collections/x/records')).toEqual({ items: [1] });
    expect(reads).toBe(2);
  });

  it('repeats a read once after a gateway error, but never repeats a write', async () => {
    let reads = 0; let writes = 0;
    const { pbAdminFetch } = await load(async (url, init) => {
      if (url.includes('auth-with-password')) return json({ token: 't' });
      if (init?.method === 'PATCH') { writes++; throw new TypeError('Failed to fetch'); }
      reads++;
      return reads === 1 ? json({}, 502) : json({ ok: 1 });
    });
    expect(await pbAdminFetch('/api/collections/x/records')).toEqual({ ok: 1 });
    await expect(pbAdminFetch('/api/collections/x/records/abc', { method: 'PATCH', body: '{}' })).rejects.toThrow();
    expect(writes).toBe(1);
  });

  it('refuses a path that climbs out of the collection (it would aim the superuser token at another endpoint)', async () => {
    const { pbAdminFetch } = await load(async () => json({ token: 't' }));
    for (const bad of ['/api/collections/hr_profiles/records/../../../admins/abc', '/api/collections/x/records/%2e%2e/admins', '/api/collections/x/records/..%2fadmins/abc']) {
      await expect(pbAdminFetch(bad)).rejects.toThrow(/Refusing/);
    }
  });

  it('shares one sign-in between requests that start together', async () => {
    let signIns = 0;
    const { pbAdminFetch } = await load(async url => { if (url.includes('auth-with-password')) { signIns++; await new Promise(r => setTimeout(r, 10)); return json({ token: 't' }); } return json({}); });
    await Promise.all([pbAdminFetch('/api/a'), pbAdminFetch('/api/b'), pbAdminFetch('/api/c')]);
    expect(signIns).toBe(1);
  });
});
