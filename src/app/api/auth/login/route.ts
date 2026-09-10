import { NextResponse } from 'next/server';
import { adminFindProfileByEmail, adminGetKV, adminUpdateProfile } from '@/lib/pbAdmin';
import { signSessionToken, verifyPassword, isBcryptHash, hashPassword } from '@/lib/serverAuth';
import { checkRateLimit, clearRateLimit } from '@/lib/rateLimit';

export const runtime = 'edge';

// Server-side replacement for the plaintext credential check that used to
// live directly in src/app/auth/page.tsx's client bundle — see that file's
// git history for the two hardcoded super-admin/HR credentials and the
// `profile.password === password` comparison this replaces. Doing this here
// instead means:
//   1. The real password value never has to be sent to the browser at all
//      (previously every login attempt fetched EVERY employee's profile,
//      password field included, into the browser just to find one match).
//   2. Super-admin/HR master credentials live only as bcrypt hashes in
//      server env vars, never in the repo or the shipped JS bundle.
//   3. This route uses a real PocketBase admin token (src/lib/pbAdmin.ts),
//      so it keeps working once hr_profiles' API rules get locked down to
//      Admins Only — unlike the old client-side check, which depended on
//      hr_profiles staying fully public forever.
//
// Response body on success: { role, email, token } — `token` is a signed
// JWT (see src/lib/serverAuth.ts), stored client-side exactly where the old
// random sessionToken used to go (src/lib/session.ts's setSession). It's
// used as the Authorization: Bearer header for the new protected routes
// (currently just /api/payroll/me).
export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  // Plan 013 step 3: 5 attempts per 15 minutes per email, before any actual
  // credential check runs (so an attacker pays the rate-limit cost on every
  // guess, not just the ones that get past it). Thresholds flagged in the
  // plan as needing product-owner sign-off, not a hard requirement — easy
  // to retune here if 5/15min proves too strict or too loose in practice.
  const rateLimitKey = `login_ratelimit_${email}`;
  const rl = await checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);
  if (!rl.allowed) {
    const minutes = Math.ceil((rl.retryAfterSeconds || 0) / 60);
    return NextResponse.json(
      { error: `Too many login attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` },
      { status: 429 }
    );
  }

  try {
    // ── Super-admin / HR-master aliases ──────────────────────────────────
    // Both optional — if unset, these two special logins are simply
    // disabled (a safe default) rather than falling back to any hardcoded
    // credential. See .env.example for how to set these up.
    const superEmail = (process.env.SUPERADMIN_LOGIN_EMAIL || '').toLowerCase();
    const superHash = process.env.SUPERADMIN_LOGIN_PASSWORD_HASH;
    const superTarget = (process.env.SUPERADMIN_TARGET_EMAIL || '').toLowerCase();
    if (superEmail && superHash && superTarget && email === superEmail) {
      const ok = await verifyPassword(password, superHash);
      if (!ok) return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
      const token = await signSessionToken({ email: superTarget, role: 'admin' });
      await clearRateLimit(rateLimitKey);
      return NextResponse.json({ role: 'admin', email: superTarget, token });
    }

    const hrEmail = (process.env.HR_MASTER_LOGIN_EMAIL || '').toLowerCase();
    const hrHash = process.env.HR_MASTER_LOGIN_PASSWORD_HASH;
    if (hrEmail && hrHash && email === hrEmail) {
      const ok = await verifyPassword(password, hrHash);
      if (!ok) return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
      const token = await signSessionToken({ email: hrEmail, role: 'hr' });
      await clearRateLimit(rateLimitKey);
      return NextResponse.json({ role: 'hr', email: hrEmail, token });
    }

    // ── Regular hr_profiles login ────────────────────────────────────────
    const profile = await adminFindProfileByEmail(email);
    if (!profile) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    // Plan 013 step 1: every account is now given a real (per-account,
    // randomly generated or HR/Admin-chosen) temp password at creation
    // time (see src/app/api/admin/profile/route.ts's generateTempPassword),
    // so an account with no stored password at all is not a valid,
    // reachable state going forward — there is no universal literal
    // ('123') that should ever authenticate it. Treat it as a
    // never-matches case rather than special-casing a shared default.
    const storedPassword: string | undefined = profile.password;
    const matches = storedPassword
      ? await verifyPassword(password, storedPassword)
      : false;

    if (!matches) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    // Offboarded check — `offboarded` isn't a real hr_profiles column, it
    // lives in the hr_profile_extra_ KV overlay (see getProfileExtras in
    // hrData.ts). Mirrors the exact same check the old client-side flow did
    // via useProfiles()'s merged overlay.
    const extras = await adminGetKV(`hr_profile_extra_${profile.id}`);
    if (extras?.value?.offboarded) {
      return NextResponse.json({ error: 'This account has been deactivated / offboarded.' }, { status: 403 });
    }

    // Transparent plaintext -> bcrypt migration: once someone logs in
    // successfully with their real password, hash and store it immediately
    // so this exact row never has to be checked in plaintext again. This
    // deliberately does NOT force a mass password reset for every existing
    // employee — that would lock everyone out until IT walks each one
    // through Forgot Password. Instead every account migrates itself, one
    // login at a time, with zero user-visible change.
    if (storedPassword && !isBcryptHash(storedPassword)) {
      try {
        const hashed = await hashPassword(password);
        await adminUpdateProfile(profile.id, { password: hashed });
      } catch (err) {
        // Best-effort — a failed migration write shouldn't block a
        // successful login; it'll just retry on the next login attempt.
        console.error('[login] password hash migration failed:', err);
      }
    }

    const role = profile.role;
    if (!['admin', 'hr', 'employee', 'team_lead'].includes(role)) {
      return NextResponse.json({ error: 'Account role is not configured correctly. Contact HR.' }, { status: 403 });
    }

    const token = await signSessionToken({ email: profile.email, role });
    await clearRateLimit(rateLimitKey);
    return NextResponse.json({ role, email: profile.email, token });
  } catch (err: any) {
    console.error('[login] error:', err);
    return NextResponse.json({ error: 'An error occurred while logging in. Please try again.' }, { status: 500 });
  }
}
