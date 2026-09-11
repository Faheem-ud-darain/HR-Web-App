// Server-only OTP generation/storage/verification for the Forgot Password
// flow. Deliberately NOT part of hrData.ts — hrData.ts is a 'use client'
// module built around the browser's `pb` instance (which talks to
// PocketBase through the '/api/pb' Next.js rewrite, i.e. relative URLs that
// only resolve inside a browser). API routes run server-side.
//
// Originally this talked to PocketBase directly over an unauthenticated
// fetch() (pb_schema.json's hr_profiles/hr_delcargo_store rules were fully
// public, so no admin auth was needed). Now that hr_profiles/hr_payroll are
// being migrated off "open to anyone with the URL" (see pbAdmin.ts), this
// flow is rewritten to go through the same server-only admin client so it
// keeps working once those collections' PocketBase rules actually get
// locked down — and so the new password it sets is hashed rather than
// written in plaintext, matching every other password-write path in the
// app (see serverAuth.ts's hashPassword). Plan 027: the OTP record and its
// rate-limit counter no longer live in the generic hr_delcargo_store KV
// table — they're their own admin-only collections (hr_password_reset_otps,
// hr_rate_limits, the latter shared with src/lib/rateLimit.ts's login rate
// limiting).

import { pbAdminFetch, adminFindByField, adminUpsertByField, adminDeleteByField } from './pbAdmin';
import { hashPassword } from './serverAuth';

const OTP_COLLECTION = 'hr_password_reset_otps';
const RATE_LIMIT_COLLECTION = 'hr_rate_limits';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

interface OtpRecord {
  otp: string;
  expiresAt: number; // epoch ms
  attempts: number;
}

interface RateLimitRecord {
  count: number;
  lastSentAt: number; // epoch ms
  resetAt: number; // epoch ms (midnight / 24h reset)
}

// Progressive delay schedule in seconds:
// 1st request -> 30s delay before 2nd request allowed
// 2nd request -> 60s delay before 3rd request allowed
// 3rd request -> 120s (2m) delay before 4th request allowed
// 4th request -> 240s (4m) delay before 5th request allowed
// 5th request -> 300s (5m) delay before next attempt
const COOLDOWN_DELAYS_SEC = [30, 60, 120, 240, 300];
const MAX_DAILY_OTPS = 5;

function otpEmailKey(email: string): string {
  return email.toLowerCase().trim();
}

function rateLimitKey(email: string): string {
  return `otp_ratelimit_${email.toLowerCase().trim()}`;
}

async function getOtpRecord(email: string): Promise<{ id: string; value: any } | null> {
  const row = await adminFindByField(OTP_COLLECTION, 'email', otpEmailKey(email));
  return row ? { id: row.id, value: row.data } : null;
}

async function setOtpRecord(email: string, value: any): Promise<void> {
  await adminUpsertByField(OTP_COLLECTION, 'email', otpEmailKey(email), value);
}

async function deleteOtpRecord(email: string): Promise<void> {
  await adminDeleteByField(OTP_COLLECTION, 'email', otpEmailKey(email));
}

async function getRlRecord(rlKey: string): Promise<{ id: string; value: any } | null> {
  const row = await adminFindByField(RATE_LIMIT_COLLECTION, 'rate_key', rlKey);
  return row ? { id: row.id, value: row.data } : null;
}

async function setRlRecord(rlKey: string, value: any): Promise<void> {
  await adminUpsertByField(RATE_LIMIT_COLLECTION, 'rate_key', rlKey, value);
}

// Same case-insensitivity fix as adminFindProfileByEmail in pbAdmin.ts: an
// exact `email = "<lowercased>"` filter silently misses any profile whose
// email was ever saved with mixed case (e.g. "Faheem@delcargo.us"), because
// PocketBase's "=" filter is a plain case-sensitive SQLite comparison. That
// silently broke the Forgot Password flow for any such account — the OTP
// request would look up zero profiles and (correctly, to avoid leaking
// which emails exist) respond as if it succeeded, so no code ever arrived
// and there was no visible error to explain why. Fixed by fetching
// candidates with "~" (case-insensitive contains) and resolving to the
// exact address in JS.
export async function findProfileByEmail(email: string): Promise<{ id: string; email: string; fullName: string } | null> {
  const clean = email.toLowerCase().trim();
  const escaped = clean.replace(/"/g, '\\"');
  const encoded = encodeURIComponent(`email ~ "${escaped}"`);
  const list = await pbAdminFetch(`/api/collections/hr_profiles/records?filter=${encoded}&perPage=20`);
  const items: any[] = list?.items || [];
  const item = items.find((p) => (p.email || '').toLowerCase().trim() === clean);
  return item ? { id: item.id, email: item.email, fullName: item.full_name } : null;
}

function generateOtp(): string {
  // 6-digit numeric code, zero-padded.
  return String(Math.floor(100000 + Math.random() * 900000));
}

export type CreateOtpResult =
  | { ok: true; otp: string; cooldownSec: number; count: number }
  | { ok: false; reason: 'daily_limit_exceeded'; waitSeconds: number }
  | { ok: false; reason: 'cooldown_active'; waitSeconds: number };

export async function createAndStoreOtp(email: string): Promise<CreateOtpResult> {
  const now = Date.now();
  const rlKey = rateLimitKey(email);
  const existingRl = await getRlRecord(rlKey);

  let rl: RateLimitRecord = existingRl?.value || { count: 0, lastSentAt: 0, resetAt: now + 24 * 60 * 60 * 1000 };

  // Reset counter if 24 hours have passed since reset window
  if (now > rl.resetAt) {
    rl = { count: 0, lastSentAt: 0, resetAt: now + 24 * 60 * 60 * 1000 };
  }

  // Enforcement 1: Maximum 5 OTPs per 24 hours
  if (rl.count >= MAX_DAILY_OTPS) {
    const waitSeconds = Math.ceil((rl.resetAt - now) / 1000);
    return { ok: false, reason: 'daily_limit_exceeded', waitSeconds };
  }

  // Enforcement 2: Progressive Cooldown Timers (30s, 60s, 120s, 240s, 300s)
  if (rl.count > 0 && rl.lastSentAt > 0) {
    const requiredDelaySec = COOLDOWN_DELAYS_SEC[Math.min(rl.count - 1, COOLDOWN_DELAYS_SEC.length - 1)];
    const elapsedSec = (now - rl.lastSentAt) / 1000;
    if (elapsedSec < requiredDelaySec) {
      const waitSeconds = Math.ceil(requiredDelaySec - elapsedSec);
      return { ok: false, reason: 'cooldown_active', waitSeconds };
    }
  }

  const otp = generateOtp();
  const record: OtpRecord = { otp, expiresAt: now + OTP_TTL_MS, attempts: 0 };
  await setOtpRecord(email, record);

  // Update Rate Limit record
  const newCount = rl.count + 1;
  const nextCooldownSec = COOLDOWN_DELAYS_SEC[Math.min(newCount - 1, COOLDOWN_DELAYS_SEC.length - 1)];
  const updatedRl: RateLimitRecord = {
    count: newCount,
    lastSentAt: now,
    resetAt: rl.resetAt,
  };
  await setRlRecord(rlKey, updatedRl);

  return { ok: true, otp, cooldownSec: nextCooldownSec, count: newCount };
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'expired' | 'too_many_attempts' | 'incorrect' };

export async function verifyOtp(email: string, submittedOtp: string): Promise<VerifyOtpResult> {
  const existing = await getOtpRecord(email);
  if (!existing || !existing.value) return { ok: false, reason: 'not_found' };

  const record = existing.value as OtpRecord;

  if (Date.now() > record.expiresAt) {
    await deleteOtpRecord(email);
    return { ok: false, reason: 'expired' };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await deleteOtpRecord(email);
    return { ok: false, reason: 'too_many_attempts' };
  }

  if (record.otp !== submittedOtp.trim()) {
    await setOtpRecord(email, { ...record, attempts: record.attempts + 1 });
    return { ok: false, reason: 'incorrect' };
  }

  return { ok: true };
}

export async function consumeOtp(email: string): Promise<void> {
  await deleteOtpRecord(email);
}

export async function setProfilePassword(profileId: string, newPassword: string): Promise<void> {
  const hashed = await hashPassword(newPassword);
  await pbAdminFetch(`/api/collections/hr_profiles/records/${profileId}`, {
    method: 'PATCH',
    body: JSON.stringify({ password: hashed }),
  });
}
