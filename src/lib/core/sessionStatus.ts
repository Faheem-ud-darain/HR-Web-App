// Whether a signed-in token should still be honoured, decided from the account as it is NOW. The token only proves who signed in
// (up to 90 days ago); the role and the offboarded flag in it are a copy, so they are always replaced by the live values.
export type SessionRole = 'admin' | 'hr' | 'employee' | 'team_lead';
export const SESSION_ROLES: readonly SessionRole[] = ['admin', 'hr', 'employee', 'team_lead'];

/** The live role and whether the account is still active. `null` profile = the account no longer exists. */
export interface LiveAccount { role?: unknown; offboarded?: unknown }

/** The role to use for this request, or null when the account is gone, offboarded or has no valid role. */
export function liveRole(account: LiveAccount | null): SessionRole | null {
  if (!account || account.offboarded) return null;
  return SESSION_ROLES.find(r => r === account.role) ?? null;
}
