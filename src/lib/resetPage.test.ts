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
