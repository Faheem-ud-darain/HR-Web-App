import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real route, with the session and the database mocked, to prove who may change what (see lib/server/profileGuards).
let session: { email: string; role: string } | null = null;
const target = { email: 'target@x.us', role: 'employee' };
const updateProfile = vi.fn(async () => {});
const created = vi.fn(async () => ({ id: 'newprofile00001' }));

vi.mock('@/lib/serverAuth', () => ({
  requireSession: vi.fn(async () => session),
  hashPassword: vi.fn(async (p: string) => `pbkdf2$hashed$${p}`),
  isBcryptHash: vi.fn((v: string) => String(v).startsWith('pbkdf2$')),
}));
vi.mock('@/lib/pbAdmin', () => ({
  adminUpdateProfile: updateProfile,
  adminUploadProfilePicture: vi.fn(async () => {}),
  adminUpsertByField: vi.fn(async () => {}),
  adminDeleteByField: vi.fn(async () => {}),
  adminMergeExtras: vi.fn(async () => {}),
  adminMergeDocs: vi.fn(async () => {}),
  adminGetProfileIdentity: vi.fn(async () => ({ ...target })),
  pbAdminFetch: created,
}));

const { POST, PUT, PATCH } = await import('@/app/api/admin/profile/route');
const ID = 'abcdefghij12345';
const req = (method: string, body: unknown) => new Request('http://x/api/admin/profile', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => { vi.clearAllMocks(); session = null; target.role = 'employee'; target.email = 'target@x.us'; });

describe('POST /api/admin/profile (field updates)', () => {
  it('refuses a caller that is not signed in or not HR/Admin', async () => {
    expect((await POST(req('POST', { profileId: ID, updates: { jobTitle: 'x' } }))).status).toBe(401);
    session = { email: 'e@x.us', role: 'employee' };
    expect((await POST(req('POST', { profileId: ID, updates: { jobTitle: 'x' } }))).status).toBe(403);
    expect(updateProfile).not.toHaveBeenCalled();
  });
  it('lets HR edit an ordinary field and promote an employee to team lead', async () => {
    session = { email: 'hr@x.us', role: 'hr' };
    expect((await POST(req('POST', { profileId: ID, updates: { jobTitle: 'Agent' } }))).status).toBe(200);
    expect((await POST(req('POST', { profileId: ID, updates: { role: 'team_lead' } }))).status).toBe(200);
  });
  it('stops HR making anyone Admin or HR, and nothing is written', async () => {
    session = { email: 'hr@x.us', role: 'hr' };
    for (const role of ['admin', 'hr']) {
      const res = await POST(req('POST', { profileId: ID, updates: { role } }));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/Only an Admin/);
    }
    expect(updateProfile).not.toHaveBeenCalled();
  });
  it('stops HR changing their own role, or the role or password of an Admin account', async () => {
    session = { email: 'hr@x.us', role: 'hr' };
    target.email = 'hr@x.us'; target.role = 'hr';
    expect((await POST(req('POST', { profileId: ID, updates: { role: 'employee' } }))).status).toBe(403);
    target.email = 'boss@x.us'; target.role = 'admin';
    expect((await POST(req('POST', { profileId: ID, updates: { role: 'employee' } }))).status).toBe(403);
    expect((await POST(req('POST', { profileId: ID, updates: { password: 'newpassword1' } }))).status).toBe(403);
    expect(updateProfile).not.toHaveBeenCalled();
  });
  it('lets an Admin do all of it', async () => {
    session = { email: 'boss@x.us', role: 'admin' };
    expect((await POST(req('POST', { profileId: ID, updates: { role: 'admin' } }))).status).toBe(200);
    expect(updateProfile).toHaveBeenCalled();
  });
  it('rejects an id that could change the URL (path traversal), before anything else', async () => {
    session = { email: 'boss@x.us', role: 'admin' };
    const res = await POST(req('POST', { profileId: '../../../admins/abc', updates: { email: 'a@b.us' } }));
    expect(res.status).toBe(400);
    expect(updateProfile).not.toHaveBeenCalled();
  });
});

describe('PUT /api/admin/profile (password reset)', () => {
  it("stops HR resetting an Admin's password, but allows resetting an employee's", async () => {
    session = { email: 'hr@x.us', role: 'hr' };
    target.role = 'admin';
    const denied = await PUT(req('PUT', { action: 'resetPassword', profileId: ID, newPassword: 'newpassword1' }));
    expect(denied.status).toBe(403);
    expect(updateProfile).not.toHaveBeenCalled();
    target.role = 'employee';
    expect((await PUT(req('PUT', { action: 'resetPassword', profileId: ID, newPassword: 'newpassword1' }))).status).toBe(200);
  });
  it('rejects a bad id', async () => {
    session = { email: 'hr@x.us', role: 'hr' };
    expect((await PUT(req('PUT', { action: 'approveOnboarding', profileId: '../x' }))).status).toBe(400);
  });
});

describe('PATCH /api/admin/profile (add employee)', () => {
  it('stops HR creating an Admin or HR account, and nothing is created', async () => {
    session = { email: 'hr@x.us', role: 'hr' };
    expect((await PATCH(req('PATCH', { action: 'addEmployee', profile: { fullName: 'N', email: 'n@x.us', role: 'admin' } }))).status).toBe(403);
    expect(created).not.toHaveBeenCalled();
  });
  it('lets HR add an ordinary employee and an Admin add anyone', async () => {
    session = { email: 'hr@x.us', role: 'hr' };
    expect((await PATCH(req('PATCH', { action: 'addEmployee', profile: { fullName: 'N', email: 'n@x.us', role: 'employee' } }))).status).toBe(200);
    session = { email: 'boss@x.us', role: 'admin' };
    expect((await PATCH(req('PATCH', { action: 'addEmployee', profile: { fullName: 'N2', email: 'n2@x.us', role: 'admin' } }))).status).toBe(200);
  });
});
