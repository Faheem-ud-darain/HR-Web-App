// Who may change what on an employee profile. HR can manage employees day to day, but the two powers that decide who may do what, giving a
// person the HR or Admin role and setting an HR or Admin account's password, belong to Admin only. Without this an HR user could make
// themselves Admin (and then pay the company) or take over an Admin account by resetting its password.
export interface GuardSession { email: string; role: string }
export interface GuardTarget { email?: string; role?: string }

const PRIVILEGED = new Set(['admin', 'hr']);
const isPrivileged = (role?: string) => PRIVILEGED.has(String(role || '').toLowerCase());

/** PocketBase record ids are 15 letters and digits. Anything else must never reach a URL built from it. */
export function isPbId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{15}$/.test(value);
}

export type GuardResult = { ok: true } | { ok: false; reason: string };
const deny = (reason: string): GuardResult => ({ ok: false, reason });

/**
 * `updates` are the profile fields being written; `settingPassword` is true for a password change or reset. `target` is the profile being
 * changed (its CURRENT role, read from the database, not from the request).
 */
export function canChangeProfile(args: { session: GuardSession; target: GuardTarget; updates?: Record<string, unknown>; settingPassword?: boolean }): GuardResult {
  const { session, target, updates, settingPassword } = args;
  if (session.role === 'admin') return { ok: true };
  if (session.role !== 'hr') return deny('Not authorized.');

  const sameAccount = !!target.email && target.email.toLowerCase() === session.email.toLowerCase();
  if (updates && 'role' in updates) {
    if (sameAccount) return deny('You cannot change your own role.');
    if (isPrivileged(String(updates.role))) return deny('Only an Admin can give the HR or Admin role.');
    if (isPrivileged(target.role)) return deny('Only an Admin can change the role of an HR or Admin account.');
  }
  if (settingPassword && isPrivileged(target.role) && !sameAccount) return deny('Only an Admin can set the password of an HR or Admin account.');
  return { ok: true };
}

/** For a brand-new employee: HR cannot create an HR or Admin account. */
export function canCreateWithRole(session: GuardSession, role: unknown): GuardResult {
  if (session.role === 'admin') return { ok: true };
  if (isPrivileged(typeof role === 'string' ? role : '')) return deny('Only an Admin can create an HR or Admin account.');
  return { ok: true };
}
