// Server-only OTP generation/storage/verification for the Forgot Password
// flow. Deliberately NOT part of hrData.ts — hrData.ts is a 'use client'
// module built around the browser's `pb` instance (which talks to
// PocketBase through the '/api/pb' Next.js rewrite, i.e. relative URLs that
// only resolve inside a browser). API routes run server-side, so this talks
// to PocketBase directly over plain fetch(), the same pattern already used
// by src/app/api/pb/api/realtime/route.ts.
//
// No admin/superuser auth is used or needed here: pb_schema.json confirms
// both hr_profiles and hr_delcargo_store have fully open rules (listRule/
// viewRule/createRule/updateRule/deleteRule all `""`, i.e. public), matching
// this app's existing model where login is a plain client-side password
// string comparison rather than PocketBase's own auth system. That's an
// existing, deliberate characteristic of this app — not something
// introduced by this feature.

const PB_URL = 'https://pb.delcargo.us';
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

function kvKey(email: string): string {
  return `password_reset_${email.toLowerCase().trim()}`;
}

function rateLimitKey(email: string): string {
  return `otp_ratelimit_${email.toLowerCase().trim()}`;
}

async function pbFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${PB_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PocketBase ${path} failed: ${res.status} ${body}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function getKvRecord(key: string): Promise<{ id: string; value: any } | null> {
  const encoded = encodeURIComponent(`key = "${key}"`);
  const list = await pbFetch(`/api/collections/hr_delcargo_store/records?filter=${encoded}&perPage=1`);
  const item = list?.items?.[0];
  return item ? { id: item.id, value: item.value } : null;
}

async function setKvRecord(key: string, value: any): Promise<void> {
  const existing = await getKvRecord(key);
  if (existing) {
    await pbFetch(`/api/collections/hr_delcargo_store/records/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    });
  } else {
    await pbFetch(`/api/collections/hr_delcargo_store/records`, {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    });
  }
}

async function deleteKvRecord(key: string): Promise<void> {
  const existing = await getKvRecord(key);
  if (existing) {
    await pbFetch(`/api/collections/hr_delcargo_store/records/${existing.id}`, { method: 'DELETE' });
  }
}

export async function findProfileByEmail(email: string): Promise<{ id: string; email: string; fullName: string } | null> {
  const clean = email.toLowerCase().trim();
  const encoded = encodeURIComponent(`email = "${clean}"`);
  const list = await pbFetch(`/api/collections/hr_profiles/records?filter=${encoded}&perPage=1`);
  const item = list?.items?.[0];
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
  const existingRl = await getKvRecord(rlKey);

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
  await setKvRecord(kvKey(email), record);

  // Update Rate Limit record
  const newCount = rl.count + 1;
  const nextCooldownSec = COOLDOWN_DELAYS_SEC[Math.min(newCount - 1, COOLDOWN_DELAYS_SEC.length - 1)];
  const updatedRl: RateLimitRecord = {
    count: newCount,
    lastSentAt: now,
    resetAt: rl.resetAt,
  };
  await setKvRecord(rlKey, updatedRl);

  return { ok: true, otp, cooldownSec: nextCooldownSec, count: newCount };
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'expired' | 'too_many_attempts' | 'incorrect' };

export async function verifyOtp(email: string, submittedOtp: string): Promise<VerifyOtpResult> {
  const key = kvKey(email);
  const existing = await getKvRecord(key);
  if (!existing || !existing.value) return { ok: false, reason: 'not_found' };

  const record = existing.value as OtpRecord;

  if (Date.now() > record.expiresAt) {
    await deleteKvRecord(key);
    return { ok: false, reason: 'expired' };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await deleteKvRecord(key);
    return { ok: false, reason: 'too_many_attempts' };
  }

  if (record.otp !== submittedOtp.trim()) {
    await setKvRecord(key, { ...record, attempts: record.attempts + 1 });
    return { ok: false, reason: 'incorrect' };
  }

  return { ok: true };
}

export async function consumeOtp(email: string): Promise<void> {
  await deleteKvRecord(kvKey(email));
}

export async function setProfilePassword(profileId: string, newPassword: string): Promise<void> {
  await pbFetch(`/api/collections/hr_profiles/records/${profileId}`, {
    method: 'PATCH',
    body: JSON.stringify({ password: newPassword }),
  });
}
