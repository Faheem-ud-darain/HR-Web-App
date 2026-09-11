// Server-only fixed-window rate limiter, backed by the hr_rate_limits
// collection (see plan 027 — this used to share the generic
// hr_delcargo_store KV table with src/lib/passwordResetOtp.ts's own
// daily-OTP-count / progressive-cooldown limiting; both now write into
// this same dedicated, admin-only table via adminUpsertByField/
// adminFindByField's generic find-or-create-by-field shape). No new
// infrastructure (Redis, Cloudflare Turnstile, etc.), and Edge-runtime
// compatible since it goes through pbAdmin.ts's admin-authenticated fetch
// like everything else that needs a small piece of server-side state.
//
// Never import this from a 'use client' file — like pbAdmin.ts, it only
// makes sense running server-side with the admin token.
import { adminFindByField, adminUpsertByField } from './pbAdmin';

const RATE_LIMIT_COLLECTION = 'hr_rate_limits';

export interface RateLimitResult {
  allowed: boolean;
  /** Only set when allowed is false — seconds until the caller may retry. */
  retryAfterSeconds?: number;
}

interface RateLimitRecord {
  count: number;
  windowStart: number; // epoch ms
}

// Checks AND increments in one call — call this once per request attempt,
// before doing the actual auth/verification work, so an attacker pays the
// cost of the check on every single guess rather than getting free guesses
// up to the limit. `key` should already be scoped to both the endpoint and
// the identifier (e.g. `login_ratelimit_${email}`) so different endpoints'
// counters never collide — it becomes this row's `rate_key`.
export async function checkRateLimit(key: string, maxAttempts: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now();
  const existing = await adminFindByField(RATE_LIMIT_COLLECTION, 'rate_key', key);
  let record: RateLimitRecord = existing?.data || { count: 0, windowStart: now };

  // Window expired — start a fresh one rather than accumulating forever.
  if (now - record.windowStart > windowMs) {
    record = { count: 0, windowStart: now };
  }

  if (record.count >= maxAttempts) {
    const retryAfterSeconds = Math.max(1, Math.ceil((record.windowStart + windowMs - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  record.count += 1;
  await adminUpsertByField(RATE_LIMIT_COLLECTION, 'rate_key', key, record);
  return { allowed: true };
}

// Called after a successful auth so a legitimate owner who mistyped their
// password a couple of times isn't left partway through the window's
// allowance the next time they actually need it.
export async function clearRateLimit(key: string): Promise<void> {
  await adminUpsertByField(RATE_LIMIT_COLLECTION, 'rate_key', key, { count: 0, windowStart: Date.now() });
}
