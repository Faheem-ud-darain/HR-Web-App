import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, { id: string; data: unknown }>();
vi.mock('./pbAdmin', () => ({
  adminFindByField: vi.fn(async (_c: string, _f: string, key: string) => store.get(key) ?? null),
  adminUpsertByField: vi.fn(async (_c: string, _f: string, key: string, data: unknown) => { store.set(key, { id: key, data }); }),
  rememberAdminUpsertId: vi.fn(),
}));
const { checkRateLimit, refundRateLimit, clearRateLimit } = await import('./rateLimit');

beforeEach(() => store.clear());

describe('login attempt counter', () => {
  it('locks out after the allowed attempts', async () => {
    for (let i = 0; i < 5; i++) expect((await checkRateLimit('k', 5, 60_000)).allowed).toBe(true);
    expect((await checkRateLimit('k', 5, 60_000)).allowed).toBe(false);
  });
  it('a refunded attempt (the server\'s failure, not a wrong password) does not count towards the lockout', async () => {
    for (let i = 0; i < 4; i++) await checkRateLimit('k', 5, 60_000);
    await checkRateLimit('k', 5, 60_000); // fifth attempt
    await refundRateLimit('k');           // it failed on our side
    expect((await checkRateLimit('k', 5, 60_000)).allowed).toBe(true); // still allowed a fifth real try
  });
  it('refund never goes below zero and never throws', async () => {
    await refundRateLimit('nothing-here');
    await checkRateLimit('k', 5, 60_000);
    await refundRateLimit('k');
    await refundRateLimit('k');
    expect((store.get('k')!.data as { count: number }).count).toBe(0);
  });
  it('a successful sign-in clears the counter', async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit('k', 5, 60_000);
    await clearRateLimit('k');
    expect((store.get('k')!.data as { count: number }).count).toBe(0);
  });
});
