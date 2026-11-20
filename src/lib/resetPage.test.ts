import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

describe('/reset.html (self-service browser reset)', () => {
  it('is the only page that tells the browser to clear its stored data', async () => {
    const rules = await nextConfig.headers!();
    const withClear = rules.filter(r => r.headers.some(h => h.key === 'Clear-Site-Data'));
    expect(withClear.map(r => r.source)).toEqual(['/reset.html']);
    const value = withClear[0].headers.find(h => h.key === 'Clear-Site-Data')!.value;
    expect(value).toContain('"storage"');
    expect(value).toContain('"cache"');
    expect(withClear[0].headers.find(h => h.key === 'Cache-Control')!.value).toBe('no-store');
  });

  it('is a plain page with no script that sends people on to sign in', () => {
    const html = readFileSync('public/reset.html', 'utf8');
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html).toContain('url=/auth');
    expect(html).toContain('href="/auth"');
  });
});

describe('nothing but the reset page itself may touch /reset.html', () => {
  it('the problem-report reachability probe never fetches it (the browser would wipe the saved login and sign the person out)', async () => {
    const { PORTAL_PROBE_PATH } = await import('./issueReports/context');
    expect(PORTAL_PROBE_PATH).not.toMatch(/reset/);
    const config = readFileSync('next.config.ts', 'utf8');
    const clearing = [...config.matchAll(/source: '([^']+)', headers: \[\s*\{ key: 'Clear-Site-Data'/g)].map(m => m[1]);
    expect(clearing).not.toContain(PORTAL_PROBE_PATH);
  });
});
