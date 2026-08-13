// Server-only email sending (Forgot Password OTP). This file must never be
// imported from a 'use client' component — it reads RESEND_API_KEY env var
// and sends email via Resend's REST API which is compatible with the Next.js
// Edge runtime (allowing API routes that use this to run on Cloudflare Pages).
//
// Why this isn't nodemailer: Cloudflare Workers / Edge runtime does not
// support raw TCP/TLS socket connections required by nodemailer. By using
// Resend's REST API via standard fetch, we remain 100% compatible.

export async function sendOtpEmail(toEmail: string, otp: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not configured.');
  }

  // The "From" header must be a verified domain in your Resend account.
  // Defaults to "Delcargo HR <noreply@delcargo.us>".
  const from = process.env.SMTP_FROM || 'Delcargo HR <noreply@delcargo.us>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [toEmail],
      subject: 'Your Delcargo HR password reset code',
      text:
        `Your password reset code is: ${otp}\n\n` +
        `This code expires in 10 minutes. If you didn't request a password reset, you can ignore this email.`,
      html: `
        <div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #0f172a; margin-bottom: 8px;">Password reset code</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.5;">
            Use the code below to reset your Delcargo HR password. It expires in 10 minutes.
          </p>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #ea580c;">${otp}</span>
          </div>
          <p style="color: #94a3b8; font-size: 12px; line-height: 1.5;">
            If you didn't request this, you can safely ignore this email — your password won't change unless
            this code is entered.
          </p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Resend API returned status ${res.status}: ${errorBody}`);
  }
}
