// Server-only email sending (Forgot Password OTP). This file must never be
// imported from a 'use client' component — it reads SMTP_* env vars and
// uses nodemailer, which needs a real Node.js runtime (that's why the API
// routes that use this set `export const runtime = 'nodejs'`).
//
// Why this isn't a pb_hook: PocketBase's JS hooks run in a limited script
// engine (goja) that can only make plain HTTP calls ($http.send), not raw
// SMTP socket connections — so a hook cannot talk to a Namecheap mailbox's
// SMTP server directly. Sending has to happen from here instead, where
// nodemailer has a real TCP/TLS socket available.
import nodemailer from 'nodemailer';

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      'SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS ' +
      '(see .env.example) — these come from the mailbox you create in Namecheap webmail/cPanel.'
    );
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465 (implicit TLS), false for 587 (STARTTLS)
    auth: { user, pass },
  });

  return cachedTransporter;
}

export async function sendOtpEmail(toEmail: string, otp: string): Promise<void> {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;

  await transporter.sendMail({
    from,
    to: toEmail,
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
  });
}
