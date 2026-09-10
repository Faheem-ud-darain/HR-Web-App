// Server-only fixed-window rate limiter, backed by the same hr_delcargo_store
// KV pattern src/lib/passwordResetOtp.ts already uses for its own
// daily-OTP-count / progressive-cooldown limiting — no new infrastructure
// (Redis, Cloudflare Turnstile, etc.), and Edge-runtime compatible since it
// goes through pbAdmin.ts's adminGetKV/adminSetKV like everything else that
// needs a small piece of server-side state without its own PocketBase
// collection.
//
// Never import this from a 'use client' file — like pbAdmin.ts, it only
// makes sense running server-side with the admin token.
import { adminGetKV, adminSetKV } from './pbAdmin';

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
// counters never collide.
export async function checkRateLimit(key: string, maxAttempts: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now();
  const existing = await adminGetKV(key);
  let record: RateLimitRecord = existing?.value || { count: 0, windowStart: now };

  // Window expired — start a fresh one rather than accumulating forever.
  if (now - record.windowStart > windowMs) {
    record = { count: 0, windowStart: now };
  }

  if (record.count >= maxAttempts) {
    const retryAfterSeconds = Math.max(1, Math.ceil((record.windowStart + windowMs - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  record.count += 1;
  await adminSetKV(key, record);
  return { allowed: true };
}

// Called after a successful auth so a legitimate owner who mistyped their
// password a couple of times isn't left partway through the window's
// allowance the next time they actually need it.
export async function clearRateLimit(key: string): Promise<void> {
  await adminSetKV(key, { count: 0, windowStart: Date.now() });
}
