import { beforeEach, describe, expect, it, vi } from 'vitest';

// POST /api/admin/payroll/corrections with the database replaced: the "previous amount" must be what was actually paid.
const db = vi.hoisted(() => ({
  paid: {} as Record<string, unknown>,
  breakdown: null as { data: Record<string, unknown> } | null,
  created: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/serverAuth', () => ({ requireSession: async () => ({ email: 'hr@x.com', role: 'hr' }) }));
vi.mock('@/lib/pbAdmin', () => ({
  adminAddNotification: async () => {},
  adminFindByField: async () => db.breakdown,
  pbAdminFetch: async (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'POST') { const row = { id: 'c1', created: 'now', ...JSON.parse(init.body || '{}') }; db.created.push(row); return row; }
    if (url.includes('/hr_payroll/records')) return { items: [db.paid] };
    if (url.includes('/hr_profiles/')) return { email: 'e@x.com' };
    return { items: [] };
  },
}));

import { POST } from '../app/api/admin/payroll/corrections/route';

const paidRow = (over: Record<string, unknown>) => ({ id: 'p1', employee_id: 'emp123', employee_name: 'Zara', region: 'Pakistan', processed: true, month: '2026-09', base_salary: 50000, bonus: 0, deductions: 0, increment_amount: 0, net_pay: 50000, ...over });
const post = (correctedAmount: number) => POST(new Request('https://app.test/api/admin/payroll/corrections', {
  method: 'POST', headers: { Authorization: 'Bearer x' }, body: JSON.stringify({ employeeId: 'emp123', month: '2026-09', correctedAmount, reason: 'Absence was approved' }),
}));

beforeEach(() => { db.paid = paidRow({}); db.breakdown = null; db.created = []; });

describe('POST /api/admin/payroll/corrections: the paid amount', () => {
  it('uses the amount the screens showed when deductions exceeded pay (zero, not the negative stored sum)', async () => {
    db.paid = paidRow({ deductions: 60000, net_pay: -10000 });
    expect((await post(5000)).status).toBe(200);
    expect(db.created[0]).toMatchObject({ previous_amount: 0, corrected_amount: 5000, difference: 5000 });
  });

  it('does not fall back to a figure without the earlier part-month pay when the stored total is zero', async () => {
    db.paid = paidRow({ base_salary: 0, net_pay: 0 });
    db.breakdown = { data: { earlierPay: 20000 } };
    await post(18000);
    expect(db.created[0]).toMatchObject({ previous_amount: 20000, difference: -2000 });
  });

  it('is unchanged for an ordinary month', async () => {
    db.paid = paidRow({ deductions: 2000, net_pay: 48000 });
    await post(47000);
    expect(db.created[0]).toMatchObject({ previous_amount: 48000, difference: -1000 });
  });
});
