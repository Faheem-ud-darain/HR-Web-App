import { NextRequest, NextResponse } from 'next/server';
import { findProfileByEmail, verifyOtp, consumeOtp, setProfilePassword } from '@/lib/passwordResetOtp';

// Enabled Edge runtime for Cloudflare Pages compatibility.
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Step 2 of Forgot Password: given {email, otp, newPassword}, verify the
// OTP (matches, not expired, under the attempt cap) and, if valid, write
// the new plain-text password directly to hr_profiles — this app's login
// is a raw client-side `profile.password === password` comparison (see
// auth/page.tsx), not PocketBase's own auth system, so there's no hashing
// step to do here; this matches how HR/Admin already reset passwords today
// (hrActions.resetPassword in hrData.ts) — same underlying write, just
// reachable without being logged in first, gated by a verified OTP instead.
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
