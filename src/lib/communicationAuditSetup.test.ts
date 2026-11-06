import { beforeEach, describe, expect, it, vi } from 'vitest';

// The one-time setup action, run for real with the database replaced: it must create a locked, admin-only table, and only when asked.
const db = vi.hoisted(() => ({ exists: false, calls: [] as { url: string; body?: Record<string, unknown> }[], role: 'admin' }));
vi.mock('@/lib/serverAuth', () => ({ requireSession: async () => ({ email: 'a@x.com', role: db.role }) }));
vi.mock('@/lib/pbAdmin', () => ({
  pbAdminFetch: async (url: string, init?: { method?: string; body?: string }) => {
    db.calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
    if (init?.method === 'POST') return {};
    if (url.includes('/api/collections/hr_communication_audit') && !db.exists) throw new Error('PocketBase 404 Not Found');
    return { id: 'x' };
  },
}));
import { POST } from '../app/api/admin/schema-migration/route';

const run = (body: unknown) => POST(new Request('https://app.test/api/admin/schema-migration', { method: 'POST', headers: { Authorization: 'Bearer x' }, body: JSON.stringify(body) }));
const created = () => db.calls.find(c => c.url === '/api/collections' && c.body)?.body as { name: string; schema: { name: string }[]; indexes: string[]; listRule: unknown; viewRule: unknown; createRule: unknown; updateRule: unknown; deleteRule: unknown } | undefined;

beforeEach(() => { db.exists = false; db.calls = []; db.role = 'admin'; });

describe('ensureCommunicationAudit', () => {
  it('is a dry run unless told otherwise: it reports and creates nothing', async () => {
    expect(await (await run({ action: 'ensureCommunicationAudit' })).json()).toMatchObject({ dryRun: true, results: { hr_communication_audit: 'would create' } });
    expect(created()).toBeUndefined();
  });
  it('creates a hidden, append-only table: every rule is null, so nothing in the app can read, change or delete an entry', async () => {
    expect(await (await run({ action: 'ensureCommunicationAudit', dryRun: false })).json()).toMatchObject({ dryRun: false, results: { hr_communication_audit: 'created' } });
    const c = created()!;
    expect(c.name).toBe('hr_communication_audit');
    expect([c.listRule, c.viewRule, c.createRule, c.updateRule, c.deleteRule]).toEqual([null, null, null, null, null]);
    expect(c.schema.map(f => f.name)).toEqual(['kind', 'ref_id', 'message_id', 'actor', 'actor_role', 'claimed_sender', 'ip', 'country', 'device', 'user_agent', 'device_id', 'occurred_at']);
    expect(c.indexes).toHaveLength(2);
  });
  it('does nothing if the table already exists, and only an Admin can run it', async () => {
    db.exists = true;
    expect(await (await run({ action: 'ensureCommunicationAudit', dryRun: false })).json()).toMatchObject({ results: { hr_communication_audit: 'already exists' } });
    expect(created()).toBeUndefined();
    db.role = 'hr';
    expect((await run({ action: 'ensureCommunicationAudit', dryRun: false })).status).toBe(403);
  });
});
