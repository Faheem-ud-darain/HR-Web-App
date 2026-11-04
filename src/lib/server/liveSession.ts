// Server-only: looks up the CURRENT role and offboarded flag for a signed-in email, so demoting or offboarding someone takes effect
// within a minute instead of when their 90-day token expires. Remembered for a minute per server instance, so a busy page costs one lookup.
import { adminFindByField, adminFindProfileByEmail } from '../pbAdmin';
import { liveRole, type LiveAccount, type SessionRole } from '../core/sessionStatus';

const REMEMBER_MS = 60 * 1000;
const seen = new Map<string, { at: number; account: LiveAccount | null }>();

async function readAccount(email: string): Promise<LiveAccount | null> {
  const profile = await adminFindProfileByEmail(email);
  if (!profile) return null;
  // `offboarded` is not an hr_profiles column; it lives in the extras overlay (same place login checks).
  const extras = await adminFindByField('hr_profile_extras', 'profile_id', profile.id);
  return { role: profile.role, offboarded: (extras?.data as { offboarded?: unknown } | undefined)?.offboarded };
}

/**
 * The role this person has right now, or null when the account no longer exists, is offboarded, or has no valid role.
 * If the lookup itself fails the token's own role is kept (same fail-open choice as login: a storage hiccup must not lock everyone out)
 * and nothing is remembered, so the next request tries again.
 */
export async function currentRole(email: string, tokenRole: SessionRole, now = Date.now()): Promise<SessionRole | null> {
  const key = email.toLowerCase().trim();
  const hit = seen.get(key);
  if (hit && now - hit.at < REMEMBER_MS) return liveRole(hit.account);
  try {
    const account = await readAccount(key);
    seen.set(key, { at: now, account });
    return liveRole(account);
  } catch (err) {
    console.error('[liveSession] could not check the account, using the token:', err);
    return tokenRole;
  }
}

/** For tests: forget everything remembered. */
export const forgetLiveSessions = () => seen.clear();
