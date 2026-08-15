// Server-only session-token (JWT) signing/verification + password hashing.
// Never import this from a 'use client' file — SESSION_JWT_SECRET must
// never reach the browser bundle.
//
// Why `jose` and not `jsonwebtoken`: jsonwebtoken depends on Node's `crypto`
// module in a way that doesn't run on the Edge runtime (Cloudflare
// Pages/Workers) — the same constraint documented in serverEmail.ts for why
// this app uses Resend's REST API instead of nodemailer. `jose` is built on
// Web Crypto (SubtleCrypto), which both Node and Edge/Workers support.
//
// Password hashing does NOT use `bcryptjs` here, despite it being listed as
// a dependency in an earlier pass — testing against the real local dev
// server surfaced that bcryptjs's module (both its ESM and CJS/UMD builds)
// contains an unconditional top-level `import ... from "crypto"` /
// `require("crypto")` for its random-byte fallback path. Node's `crypto`
// module is not available under the Edge runtime, so importing bcryptjs at
// all inside an `export const runtime = 'edge'` route throws immediately —
// this silently broke both the password-change endpoints (every hash
// attempt 500'd) and the login route's "migrate plaintext to a hash on
// first login" step (silently swallowed the same error, so no account was
// ever actually being migrated off plaintext, despite the code appearing
// to do so). Confirmed by running bcryptjs directly under Next's edge
// runtime sandbox locally — it worked under plain Node but not there.
//
// Replaced with a small PBKDF2 implementation built directly on Web
// Crypto's SubtleCrypto — the same API `jose` already relies on above, and
// genuinely supported on both Node and Edge/Workers with no Node built-in
// imports at all. Stored format: `pbkdf2$<iterations>$<salt-b64>$<hash-b64>`.
import { SignJWT, jwtVerify } from 'jose';

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH_BYTES = 32;
const PBKDF2_SALT_BYTES = 16;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    PBKDF2_HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}

// Constant-time-ish comparison — avoids a naive `===` short-circuiting on
// the first mismatched byte. Not critical for this app's threat model, but
// cheap insurance for a password-hash comparison.
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const encoder = new TextEncoder();

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_JWT_SECRET;
  if (!secret) {
    throw new Error('SESSION_JWT_SECRET is not configured — set it in your deployment environment (see .env.example).');
  }
  return encoder.encode(secret);
}

export interface SessionPayload {
  email: string;
  role: 'admin' | 'hr' | 'employee' | 'team_lead';
}

// 90-day expiry — generous on purpose. Unlike a typical web session cookie,
// this app's own "Remember me" checkbox (src/lib/session.ts) already
// decides how long the token is actually *retained* client-side
// (localStorage vs sessionStorage); the JWT's own expiry here is just a
// hard backstop, not the primary mechanism for "stay signed in" vs not.
const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS)
    .sign(getSecret());
}

// Returns the verified payload, or null if the token is missing, malformed,
// expired, or signed with a different secret. Callers should treat null the
// same as "not logged in" — never assume a specific failure reason from a
// null return (that would leak whether a token merely expired vs was
// tampered with, which isn't useful to distinguish for the caller anyway).
export async function verifySessionToken(token: string | null | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const email = payload.email;
    const role = payload.role;
    if (typeof email !== 'string' || typeof role !== 'string') return null;
    if (!['admin', 'hr', 'employee', 'team_lead'].includes(role)) return null;
    return { email, role: role as SessionPayload['role'] };
  } catch {
    return null;
  }
}

// Extracts and verifies the bearer token from a standard `Authorization:
// Bearer <token>` header. Used by every protected API route added as part
// of this refactor (currently just /api/payroll/me) instead of duplicating
// the header-parsing + verify call in each route.
export async function requireSession(request: Request): Promise<SessionPayload | null> {
  const auth = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return verifySessionToken(auth.slice('Bearer '.length).trim());
}

const PBKDF2_HASH_RE = /^pbkdf2\$(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/;

// Named isBcryptHash for historical reasons (every call site imports it
// under this name to mean "is this already a hashed value, not plaintext")
// — the actual format is now pbkdf2$..., not bcrypt's $2a$/$2b$/$2y$, per
// the module comment above on why bcryptjs was dropped.
export function isBcryptHash(value: string | undefined | null): boolean {
  return !!value && PBKDF2_HASH_RE.test(value);
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const hash = await pbkdf2(plain, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

// Compares a submitted password against a stored value that may be either
// a pbkdf2$... hash (post-migration) or plain text (pre-migration, from
// before this refactor — see the login route's transparent-migration
// comment for why old plaintext rows aren't force-reset). Never throws on
// a malformed hash — the format is checked via isBcryptHash first, so a
// plaintext value never reaches the PBKDF2 parsing path.
export async function verifyPassword(submitted: string, stored: string | undefined | null): Promise<boolean> {
  if (!stored) return false;
  const match = stored.match(PBKDF2_HASH_RE);
  if (!match) return submitted === stored;
  const [, iterationsStr, saltB64, hashB64] = match;
  const salt = base64ToBytes(saltB64);
  const expected = base64ToBytes(hashB64);
  const actual = await pbkdf2(submitted, salt, parseInt(iterationsStr, 10));
  return timingSafeEqual(actual, expected);
}
