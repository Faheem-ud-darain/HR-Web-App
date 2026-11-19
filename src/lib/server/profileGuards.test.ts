import { describe, expect, it } from 'vitest';
import { canChangeProfile, canCreateWithRole, isPbId } from './profileGuards';

const hr = { email: 'hr@x.us', role: 'hr' };
const admin = { email: 'admin@x.us', role: 'admin' };

describe('canChangeProfile', () => {
  it('lets an Admin do anything', () => {
    expect(canChangeProfile({ session: admin, target: { email: 'a@x.us', role: 'hr' }, updates: { role: 'admin' }, settingPassword: true })).toEqual({ ok: true });
  });
  it('lets HR edit ordinary fields and promote an employee to team lead', () => {
    expect(canChangeProfile({ session: hr, target: { email: 'e@x.us', role: 'employee' }, updates: { jobTitle: 'Agent' } })).toEqual({ ok: true });
    expect(canChangeProfile({ session: hr, target: { email: 'e@x.us', role: 'employee' }, updates: { role: 'team_lead' } })).toEqual({ ok: true });
  });
  it('stops HR making anyone (including themselves) HR or Admin', () => {
    expect(canChangeProfile({ session: hr, target: { email: 'hr@x.us', role: 'hr' }, updates: { role: 'admin' } }).ok).toBe(false);
    expect(canChangeProfile({ session: hr, target: { email: 'e@x.us', role: 'employee' }, updates: { role: 'admin' } }).ok).toBe(false);
    expect(canChangeProfile({ session: hr, target: { email: 'e@x.us', role: 'employee' }, updates: { role: 'HR' } }).ok).toBe(false);
  });
  it('stops HR changing the role of an HR or Admin account, or their own role', () => {
    expect(canChangeProfile({ session: hr, target: { email: 'admin@x.us', role: 'admin' }, updates: { role: 'employee' } }).ok).toBe(false);
    expect(canChangeProfile({ session: hr, target: { email: 'hr@x.us', role: 'hr' }, updates: { role: 'employee' } }).ok).toBe(false);
  });
  it('stops HR setting the password of an Admin or another HR account, but not of an employee', () => {
    expect(canChangeProfile({ session: hr, target: { email: 'admin@x.us', role: 'admin' }, settingPassword: true }).ok).toBe(false);
    expect(canChangeProfile({ session: hr, target: { email: 'other-hr@x.us', role: 'hr' }, settingPassword: true }).ok).toBe(false);
    expect(canChangeProfile({ session: hr, target: { email: 'e@x.us', role: 'employee' }, settingPassword: true })).toEqual({ ok: true });
  });
  it('lets nobody else in', () => {
    expect(canChangeProfile({ session: { email: 'e@x.us', role: 'employee' }, target: {}, updates: {} }).ok).toBe(false);
  });
});

describe('canCreateWithRole', () => {
  it('stops HR creating HR or Admin accounts', () => {
    expect(canCreateWithRole(hr, 'admin').ok).toBe(false);
    expect(canCreateWithRole(hr, 'hr').ok).toBe(false);
    expect(canCreateWithRole(hr, 'employee')).toEqual({ ok: true });
    expect(canCreateWithRole(admin, 'admin')).toEqual({ ok: true });
  });
});

describe('isPbId', () => {
  it('accepts real ids and rejects anything that could change a URL path', () => {
    expect(isPbId('ykif7514d3jxybq')).toBe(true);
    expect(isPbId('../../../admins/abc')).toBe(false);
    expect(isPbId('abc')).toBe(false);
    expect(isPbId(undefined)).toBe(false);
    expect(isPbId('ykif7514d3jxyb/')).toBe(false);
  });
});
