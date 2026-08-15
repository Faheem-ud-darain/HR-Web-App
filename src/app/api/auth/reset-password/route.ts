import { NextRequest, NextResponse } from 'next/server';
import { findProfileByEmail, verifyOtp, consumeOtp, setProfilePassword } from '@/lib/passwordResetOtp';

// Enabled Edge runtime for Cloudflare Pages compatibility.
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Step 2 (final) of Forgot Password: given {email, otp, newPassword},
// verify the OTP (matches, not expired, under the attempt cap) and, if
// valid, hash and write the new password to hr_profiles via
// setProfilePassword (see passwordResetOtp.ts — it calls hashPassword from
// serverAuth.ts, the same PBKDF2/Web Crypto hashing every other
// password-write path in the app uses). Login itself is verified
// server-side too (see /api/auth/login), not a client-side plaintext
// comparison — that description used to be accurate before this app's
// security refactor moved password handling off the fully-public
// PocketBase client, but isn't anymore.
//
// The UI now splits this into two visual steps (see auth/page.tsx): the
// user enters the code first and it's checked via the lightweight
// /api/auth/verify-reset-otp before the new-password fields even appear.
// This route still independently re-verifies the OTP itself before writing
// anything — never trust the client's word that a code was already
// confirmed valid.
export async function POST(req: NextRequest) {
  let email: string, otp: string, newPassword: string;
  try {
    const body = await req.json();
    email = String(body?.email || '').trim();
    otp = String(body?.otp || '').trim();
    newPassword = String(body?.newPassword || '');
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!email || !otp) {
    return NextResponse.json({ error: 'Email and code are required.' }, { status: 400 });
  }
  if (!newPassword || newPassword.length < 4) {
    return NextResponse.json({ error: 'Choose a password at least 4 characters long.' }, { status: 400 });
  }

  try {
    const result = await verifyOtp(email, otp);
    if (!result.ok) {
      const messages: Record<string, string> = {
        not_found: 'No pending reset request for this email. Request a new code.',
        expired: 'This code has expired. Request a new one.',
        too_many_attempts: 'Too many incorrect attempts. Request a new code.',
        incorrect: 'Incorrect code. Please check and try again.',
      };
      return NextResponse.json({ error: messages[result.reason] || 'Invalid code.' }, { status: 400 });
    }

    const profile = await findProfileByEmail(email);
    if (!profile) {
      // Shouldn't happen if an OTP was issued, but guard anyway.
      await consumeOtp(email);
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    await setProfilePassword(profile.id, newPassword);
    await consumeOtp(email);

    return NextResponse.json({ message: 'Password updated. You can log in with your new password now.' });
  } catch (err) {
    console.error('[reset-password] Unexpected error:', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
