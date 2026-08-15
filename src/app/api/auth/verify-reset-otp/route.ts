import { NextRequest, NextResponse } from 'next/server';
import { verifyOtp } from '@/lib/passwordResetOtp';

// Enabled Edge runtime for Cloudflare Pages compatibility, same as the other
// two Forgot Password routes.
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Lightweight companion to /api/auth/reset-password, used only so the
// Forgot Password UI can split into two visual steps — enter the code,
// THEN see the new-password fields — instead of showing both at once and
// only finding out the code was wrong after the user has already typed a
// new password. This deliberately does NOT consume the OTP or touch the
// password: it just calls the same verifyOtp() check reset-password itself
// runs, and reports ok/error.
//
// Calling verifyOtp() twice for one successful code (once here, once again
// inside reset-password's actual submit) is safe and intentional — looking
// at verifyOtp's implementation in passwordResetOtp.ts, a *correct* guess
// neither increments the attempts counter nor consumes the record; only an
// incorrect guess increments attempts, and only consumeOtp() (called at the
// end of reset-password, after the password write succeeds) invalidates the
// code. So a user can pass this check, then still take a few seconds typing
// their new password, and the final submit re-checks the same code with no
// double-counting and no early expiry side effects introduced by this route.
export async function POST(req: NextRequest) {
  let email: string, otp: string;
  try {
    const body = await req.json();
    email = String(body?.email || '').trim();
    otp = String(body?.otp || '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!email || !otp) {
    return NextResponse.json({ error: 'Email and code are required.' }, { status: 400 });
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
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[verify-reset-otp] Unexpected error:', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
