import { NextRequest, NextResponse } from 'next/server';
import { findProfileByEmail, createAndStoreOtp } from '@/lib/passwordResetOtp';
import { sendOtpEmail } from '@/lib/serverEmail';

// Enabled Edge runtime for Cloudflare Pages support (uses fetch-based Resend API).
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Step 1 of Forgot Password: given an email, if a matching hr_profiles
// record exists, generate a 6-digit OTP (10min expiry), store it in
// hr_delcargo_store, and email it via the configured SMTP mailbox.
//
// Always returns the same generic success message whether or not the email
// matched a real profile — this app already exposes employee emails/roles
// pretty openly elsewhere (hr_profiles has fully public list/view rules),
// so this isn't hiding much, but there's no reason to make enumeration any
// easier than it needs to be from this one endpoint either.
export async function POST(req: NextRequest) {
  let email: string;
  try {
    const body = await req.json();
    email = String(body?.email || '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const GENERIC_OK = NextResponse.json({
    message: 'If an account exists for that email, a reset code has been sent.',
  });

  try {
    const profile = await findProfileByEmail(email);
    if (!profile) {
      // Don't reveal whether the email exists.
      return GENERIC_OK;
    }

    const otpResult = await createAndStoreOtp(profile.email);

    if (!otpResult.ok) {
      if (otpResult.reason === 'daily_limit_exceeded') {
        const hours = Math.ceil(otpResult.waitSeconds / 3600);
        return NextResponse.json(
          { error: `Daily limit reached (5/5 codes requested). Please try again in ~${hours} hours or contact HR.`, waitSeconds: otpResult.waitSeconds },
          { status: 429 }
        );
      }
      if (otpResult.reason === 'cooldown_active') {
        return NextResponse.json(
          { error: `Please wait ${otpResult.waitSeconds} seconds before requesting another code.`, waitSeconds: otpResult.waitSeconds },
          { status: 429 }
        );
      }
    }

    try {
      await sendOtpEmail(profile.email, otpResult.otp);
    } catch (emailErr) {
      console.error('[forgot-password] Failed to send OTP email:', emailErr);
      return NextResponse.json(
        { error: 'Could not send the reset email right now. Please try again shortly, or contact HR.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      message: 'If an account exists for that email, a reset code has been sent.',
      cooldownSec: otpResult.cooldownSec,
      requestCount: otpResult.count,
    });
  } catch (err) {
    console.error('[forgot-password] Unexpected error:', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
