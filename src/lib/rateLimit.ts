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
// Fails OPEN (allows the request) on any storage error — e.g. the
// hr_rate_limits collection not existing yet during a migration window,
// or a transient PocketBase hiccup. Rate limiting is defense-in-depth, not
// core auth logic; it must never be the reason nobody can log in. This is
// called directly in src/app/api/auth/login/route.ts BEFORE that route's
// own try/catch even starts, specifically so the rate-limit check itself
// runs first — which means an error thrown from in here has no other
// safety net upstream.
export async function checkRateLimit(key: string, maxAttempts: number, windowMs: number): Promise<RateLimitResult> {
  try {
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
  } catch (err) {
    console.error('[rateLimit] checkRateLimit storage error — failing open (allowing request):', err);
    return { allowed: true };
  }
}

// Called after a successful auth so a legitimate owner who mistyped their
// password a couple of times isn't left partway through the window's
// allowance the next time they actually need it. Best-effort — a failure
// here just means the next login (which already succeeded) leaves a stale
// counter behind, not a broken login.
export async function clearRateLimit(key: string): Promise<void> {
  try {
    await adminUpsertByField(RATE_LIMIT_COLLECTION, 'rate_key', key, { count: 0, windowStart: Date.now() });
  } catch (err) {
    console.error('[rateLimit] clearRateLimit storage error (non-fatal):', err);
  }
}
