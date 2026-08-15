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
// Why `bcryptjs` and not `bcrypt`: `bcrypt` is a native addon (requires a
// compiled binary) — doesn't work at all on the Edge runtime, and isn't
// guaranteed to have a matching prebuilt binary on every host either.
// `bcryptjs` is a pure-JS reimplementation, slower per-hash but runs
// anywhere, and this app's login volume doesn't come close to needing
// native-speed hashing.
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

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

const BCRYPT_HASH_RE = /^\$2[aby]?\$/;

export function isBcryptHash(value: string | undefined | null): boolean {
  return !!value && BCRYPT_HASH_RE.test(value);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

// Compares a submitted password against a stored value that may be either
// a bcrypt hash (post-migration) or plain text (pre-migration, from before
// this refactor — see the login route's transparent-migration comment for
// why old plaintext rows aren't force-reset). Never throws on a malformed
// hash — bcryptjs itself would throw on a non-bcrypt string, so plaintext
// comparison is checked first via isBcryptHash rather than try/catching.
export async function verifyPassword(submitted: string, stored: string | undefined | null): Promise<boolean> {
  if (!stored) return false;
  if (isBcryptHash(stored)) return bcrypt.compare(submitted, stored);
  return submitted === stored;
}
