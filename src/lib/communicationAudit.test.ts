import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAuditEntry, describeDevice, isNameMismatch } from './core/communicationAudit';

// The routes run for real with the database replaced, so they never touch production.
const db = vi.hoisted(() => ({
  session: { email: 'HR@delcargo.us', role: 'hr' } as { email: string; role: string } | null,
  written: [] as Record<string, unknown>[], rows: [] as Record<string, unknown>[], missing: false, urls: [] as string[],
}));
vi.mock('@/lib/serverAuth', () => ({ requireSession: async () => db.session }));
vi.mock('@/lib/pbAdmin', () => ({
  pbAdminFetch: async (url: string, init?: { method?: string; body?: string }) => {
    db.urls.push(url);
    if (db.missing) throw new Error('PocketBase 404 Not Found');
    if (init?.method === 'POST') { db.written.push(JSON.parse(init.body || '{}')); return {}; }
    return { items: db.rows };
  },
}));
import { POST } from '../app/api/audit/communication/route';
import * as readRoute from '../app/api/admin/audit/route';

const IPHONE_APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IPHONE_SAFARI = `${IPHONE_APP} Version/18.7 Safari/604.1`;
const stamp = (body: unknown, headers: Record<string, string> = {}) => POST(new Request('https://app.test/api/audit/communication', {
  method: 'POST', headers: { Authorization: 'Bearer x', 'cf-connecting-ip': '8.29.6.176', 'cf-ipcountry': 'us', 'user-agent': IPHONE_APP, ...headers }, body: JSON.stringify(body),
}));
const read = (qs = '') => readRoute.GET(new Request(`https://app.test/api/admin/audit${qs}`, { headers: { Authorization: 'Bearer x' } }));

beforeEach(() => { db.session = { email: 'HR@delcargo.us', role: 'hr' }; db.written = []; db.rows = []; db.missing = false; db.urls = []; vi.spyOn(console, 'error').mockImplementation(() => undefined); });

describe('describeDevice', () => {
  it('names the browser and system, and tells the phone app apart from Safari', () => {
    expect(describeDevice(IPHONE_SAFARI)).toBe('Safari on iOS');
    expect(describeDevice(IPHONE_APP)).toBe('Delcargo app on iOS');
    expect(describeDevice('Mozilla/5.0 (Linux; Android 14; Pixel 9; wv) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36')).toBe('Delcargo app on Android');
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36')).toBe('Chrome on Windows');
    expect(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15')).toBe('Safari on Mac');
    expect(describeDevice('')).toBe('a browser');
  });
});

describe('buildAuditEntry', () => {
  const who = { email: 'HR@delcargo.us', role: 'hr', ip: '1.2.3.4', country: 'pk', userAgent: IPHONE_SAFARI, now: Date.UTC(2026, 10, 7, 12) };
  it('takes the account, address and device from the request, never from the message body', () => {
    const r = buildAuditEntry({ kind: 'ticket_reply', refId: 'abc123', messageId: 'rep_1_x', claimedSender: ' Someone@X.com ', ip: '9.9.9.9', actor: 'forged@x.com' } as never, who);
    expect(r).toMatchObject({ ok: true, entry: { actor: 'hr@delcargo.us', actor_role: 'hr', ip: '1.2.3.4', country: 'PK', device: 'Safari on iOS', claimed_sender: 'someone@x.com', occurred_at: '2026-11-07T12:00:00.000Z' } });
  });
  it('refuses an unknown kind or a malformed reference', () => {
    expect(buildAuditEntry({ kind: 'nope', refId: 'abc' }, who).ok).toBe(false);
    expect(buildAuditEntry({ kind: 'team_chat', refId: 'a b; drop' }, who).ok).toBe(false);
    expect(buildAuditEntry({ kind: 'team_chat' }, who).ok).toBe(false);
  });
  it('flags a message that says one account sent it while another was signed in', () => {
    expect(isNameMismatch({ actor: 'hr@delcargo.us', claimed_sender: 'hr@delcargo.us' })).toBe(false);
    expect(isNameMismatch({ actor: 'hr@delcargo.us', claimed_sender: 'ceo@delcargo.us' })).toBe(true);
    expect(isNameMismatch({ actor: 'hr@delcargo.us', claimed_sender: '' })).toBe(false);
  });
});

describe('POST /api/audit/communication', () => {
  it('needs a signed-in person', async () => {
    db.session = null;
    expect((await stamp({ kind: 'team_chat', refId: 'abc' })).status).toBe(401);
    expect(db.written).toHaveLength(0);
  });
  it('stamps the real address, country and device from Cloudflare, ignoring anything the body claims', async () => {
    const res = await stamp({ kind: 'ticket_reply', refId: 'gakjijn2lzeglj9', messageId: 'rep_1_ab', claimedSender: 'hr@delcargo.us', deviceId: 'dev_abc123', ip: '6.6.6.6' });
    expect(await res.json()).toEqual({ ok: true });
    expect(db.written[0]).toMatchObject({ kind: 'ticket_reply', ref_id: 'gakjijn2lzeglj9', actor: 'hr@delcargo.us', ip: '8.29.6.176', country: 'US', device: 'Delcargo app on iOS', device_id: 'dev_abc123' });
    expect(db.urls[0]).toContain('/api/collections/hr_communication_audit/records');
  });
  it('rejects a bad body, and quietly does nothing until the table has been set up', async () => {
    expect((await stamp({ kind: 'x', refId: 'abc' })).status).toBe(400);
    db.missing = true;
    expect(await (await stamp({ kind: 'team_chat', refId: 'abc' })).json()).toEqual({ ok: false, configured: false });
  });
});

describe('GET /api/admin/audit', () => {
  it('is for HR and Admin only', async () => {
    db.session = { email: 'e@x.com', role: 'employee' };
    expect((await read()).status).toBe(403);
    db.session = { email: 'lead@x.com', role: 'team_lead' };
    expect((await read()).status).toBe(403);
    db.session = null;
    expect((await read()).status).toBe(403);
  });
  it('returns the trail newest first with the mismatch flag, and searches by kind and account', async () => {
    db.rows = [{ id: 'r1', kind: 'ticket_reply', ref_id: 't1', message_id: 'rep_1', actor: 'hr@delcargo.us', actor_role: 'hr', claimed_sender: 'ceo@delcargo.us', ip: '8.29.6.176', country: 'US', device: 'Delcargo app on iOS', occurred_at: '2026-11-07T12:00:00.000Z' }];
    const body = await (await read('?kind=ticket_reply&who=8.29')).json();
    expect(body).toMatchObject({ configured: true, items: [{ id: 'r1', actor: 'hr@delcargo.us', ip: '8.29.6.176', nameMismatch: true }] });
    expect(decodeURIComponent(db.urls[0])).toMatch(/kind = ["']ticket_reply["']/);
    expect(decodeURIComponent(db.urls[0])).toContain('8.29');
    expect(decodeURIComponent(db.urls[0])).toContain('sort=-created');
  });
  it('says so when the table is not set up yet', async () => {
    db.missing = true;
    expect(await (await read()).json()).toEqual({ configured: false, items: [] });
  });
  it('offers no way to change or delete an entry', () => {
    expect(Object.keys(readRoute).filter(k => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(k))).toEqual([]);
  });
});

describe('every way of sending a message records itself', () => {
  const src = (p: string) => readFileSync(p, 'utf8');
  it('covers tickets, chat, the HR & Admin line and announcements', () => {
    const tickets = src('src/lib/hr/tickets.ts');
    for (const kind of ['ticket_create', 'ticket_reply', "'ticket_closed'", "'ticket_reopened'"]) expect(tickets).toContain(kind);
    const teams = src('src/lib/hr/teams.ts');
    expect(teams.match(/recordCommunication\(\{ kind: 'team_chat'/g)).toHaveLength(2);
    expect(src('src/lib/hr/notifications.ts')).toContain("kind: 'announcement'");
  });
  it('is hidden: no menu links to the trail pages', () => {
    for (const f of ['src/lib/core/nav.ts', 'src/components/layout/sidebar/NavLink.tsx']) expect(src(f)).not.toMatch(/audit-trail|CommunicationAudit/);
  });
});
