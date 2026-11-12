import { describe, expect, it, vi } from 'vitest';

const listPage = vi.fn();
vi.mock('@/lib/pbAdmin', () => ({ adminListScreenshotsPage: (...a: unknown[]) => listPage(...a), pbAdminFetch: vi.fn() }));

import { latestScreenshotByEmail } from './trackingIntegrity';

const page = (items: { captured_at: string }[], totalPages = 1) => ({ items, page: 1, perPage: 20, totalItems: items.length, totalPages });

describe('latestScreenshotByEmail', () => {
  it('uses the newest screenshot, with the date in a form every parser reads', async () => {
    listPage.mockResolvedValueOnce(page([{ captured_at: '2026-11-11 18:03:00.000Z' }]));
    expect((await latestScreenshotByEmail(['Bilal@delcargo.us'])).get('bilal@delcargo.us')).toBe('2026-11-11T18:03:00.000Z');
  });

  it('keeps looking when a page held only other people whose email contains this one (ann@x vs joann@x)', async () => {
    listPage.mockResolvedValueOnce(page([], 2)).mockResolvedValueOnce(page([{ captured_at: '2026-11-10 09:00:00.000Z' }], 2));
    expect((await latestScreenshotByEmail(['ann@x.com'])).get('ann@x.com')).toBe('2026-11-10T09:00:00.000Z');
    expect(listPage).toHaveBeenLastCalledWith({ employeeEmail: 'ann@x.com' }, 2, 20);
  });

  it('reports nothing for someone who has no screenshot at all', async () => {
    listPage.mockResolvedValueOnce(page([]));
    expect((await latestScreenshotByEmail(['new@x.com'])).size).toBe(0);
  });

  it('one failing lookup does not fail the others or the whole health check', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    listPage.mockImplementation(async (f: { employeeEmail: string }) => {
      if (f.employeeEmail === 'bad@x.com') throw new Error('boom');
      return page([{ captured_at: '2026-11-11 10:00:00.000Z' }]);
    });
    const result = await latestScreenshotByEmail(['bad@x.com', 'good@x.com']);
    expect([...result.keys()]).toEqual(['good@x.com']);
  });
});
