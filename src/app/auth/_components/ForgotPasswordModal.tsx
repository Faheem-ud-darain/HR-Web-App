'use client';

import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Mail } from 'lucide-react';
import { API_BASE } from '@/lib/apiBase';
import { Button } from '@/components/ui/Button';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { OtpInput } from '@/components/ui/OtpInput';

type Step = 'email' | 'otp' | 'password' | 'done';

// POST to one of the self-service reset routes (src/app/api/auth/forgot-password, verify-reset-otp, reset-password).
// Resolves with the response body on success; otherwise with the server's message and any wait it asked for.
async function post(route: string, body: object): Promise<{ ok: true; data: Record<string, number | undefined> } | { ok: false; error?: string; waitSeconds?: number; unreachable?: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data } : { ok: false, error: data?.error, waitSeconds: data?.waitSeconds };
  } catch (err) {
    console.error(`[${route}] Fetch error:`, err);
    return { ok: false, unreachable: true };
  }
}
const UNREACHABLE = 'Could not reach the server. Check your connection and try again.';

const Info = ({ tone, children }: { tone: 'orange' | 'emerald'; children: React.ReactNode }) => (
  <div className={`flex items-start gap-3 p-4 rounded-xl border ${tone === 'orange' ? 'bg-orange-50 border-orange-100' : 'bg-emerald-50 border-emerald-100'}`}>
    <Mail className={`h-5 w-5 shrink-0 mt-0.5 ${tone === 'orange' ? 'text-orange-600' : 'text-emerald-600'}`} />
    <p className="text-xs text-slate-700 font-semibold leading-relaxed">{children}</p>
  </div>
);

const Footer = ({ left, children }: { left?: React.ReactNode; children: React.ReactNode }) => (
  <div className={`flex items-center pt-2 border-t border-slate-200 ${left ? 'justify-between' : 'justify-end'}`}>
    {left}
    {children}
  </div>
);

const linkButton = 'text-xs font-bold text-slate-500 hover:text-slate-700';

// Forgot password: enter the email, get a 6-digit code, enter the code (checked on its own before the password
// fields even appear, so a wrong or expired code is caught early), choose a new password. The code is verified with
// the lightweight verify-reset-otp route, which neither consumes it nor touches the password. Mount it only while
// open, so every visit starts at the first step.
export function ForgotPasswordModal({ initialEmail, onClose, onFinished }: { initialEmail: string; onClose: () => void; onFinished: (email: string) => void }) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Counts down the rate limit on "Resend code".
  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setInterval(() => setResendTimer(t => t - 1), 1000);
    return () => clearInterval(timer);
  }, [resendTimer]);

  const clean = email.trim().toLowerCase();
  const validEmail = () => {
    if (clean && clean.includes('@')) return true;
    setError('Enter a valid email address.');
    return false;
  };

  // Ask for a code (first time, or "Resend Code").
  const sendCode = async (resend: boolean) => {
    if (resend && (resendTimer > 0 || resendLoading)) return;
    setError('');
    if (!validEmail()) return;
    (resend ? setResendLoading : setLoading)(true);
    const result = await post('forgot-password', { email: clean });
    (resend ? setResendLoading : setLoading)(false);
    if (!result.ok) {
      setError(result.unreachable ? UNREACHABLE : result.error || (resend ? 'Something went wrong sending a new code.' : 'Something went wrong. Please try again.'));
      if (result.waitSeconds) setResendTimer(result.waitSeconds);
      return;
    }
    setInfo(resend ? 'A new 6-digit verification code has been sent to your email.' : 'If an account exists for that email, a 6-digit code has been sent — check your inbox (and spam folder).');
    if (!resend) setStep('otp');
    setResendTimer(result.data.cooldownSec || (resend ? 60 : 30));
  };

  const verifyCode = async () => {
    setError('');
    if (otp.trim().length !== 6) return setError('Enter the 6-digit code from your email.');
    setLoading(true);
    const result = await post('verify-reset-otp', { email: clean, otp: otp.trim() });
    setLoading(false);
    if (!result.ok) return setError(result.unreachable ? UNREACHABLE : result.error || 'Invalid code.');
    setStep('password');
  };

  const resetPassword = async () => {
    setError('');
    if (otp.trim().length !== 6) return setError('Enter the 6-digit code from your email.');
    if (!newPassword || newPassword.length < 4) return setError('Choose a password at least 4 characters long.');
    if (newPassword !== confirmPassword) return setError('Passwords do not match.');
    setLoading(true);
    const result = await post('reset-password', { email: clean, otp: otp.trim(), newPassword });
    setLoading(false);
    if (!result.ok) return setError(result.unreachable ? UNREACHABLE : result.error || 'Something went wrong. Please try again.');
    setStep('done');
  };

  return (
    <Modal isOpen onClose={onClose} title={step === 'done' ? 'Password Reset' : 'Forgot Password'}>
      <div className="space-y-4">
        {step === 'email' && (
          <>
            <Info tone="orange">Enter your account email and we&apos;ll send a 6-digit code you can use to set a new password.</Info>
            <div>
              <FieldLabel size="plain">Email</FieldLabel>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@delcargo.us" fieldSize="md" />
            </div>
            {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
            <Footer left={<p className="text-[11px] text-slate-400 font-semibold">Still stuck? Email hr@delcargo.us</p>}>
              <Button variant="primary" size="md" onClick={() => sendCode(false)} disabled={loading}>{loading ? 'Sending…' : 'Send Code'}</Button>
            </Footer>
          </>
        )}

        {step === 'otp' && (
          <>
            {info && <Info tone="orange">{info}</Info>}
            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 block text-center">6-digit security code</label>
              <OtpInput length={6} value={otp} onChange={setOtp} disabled={loading || resendLoading} />
              <div className="flex items-center justify-between mt-2 px-1">
                <span className="text-[11px] text-slate-400 font-medium">Didn&apos;t receive the code?</span>
                <button
                  type="button"
                  onClick={() => sendCode(true)}
                  disabled={resendTimer > 0 || resendLoading || loading}
                  className="text-xs font-bold text-orange-600 hover:text-orange-700 disabled:text-slate-400 transition-colors"
                >
                  {resendLoading ? 'Sending code…' : resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend Code'}
                </button>
              </div>
            </div>
            {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
            <Footer left={<button type="button" onClick={() => setStep('email')} className={linkButton}>Use a different email</button>}>
              <Button variant="primary" size="md" onClick={verifyCode} disabled={loading}>{loading ? 'Verifying…' : 'Continue'}</Button>
            </Footer>
          </>
        )}

        {step === 'password' && (
          <>
            <Info tone="emerald">Code verified. Choose a new password for {email}.</Info>
            <div>
              <FieldLabel size="plain">New password</FieldLabel>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-9 rounded-lg border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <FieldLabel size="plain">Confirm new password</FieldLabel>
              <Input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} fieldSize="md" />
            </div>
            {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
            <Footer left={<button type="button" onClick={() => { setStep('otp'); setError(''); }} className={linkButton}>Back</button>}>
              <Button variant="primary" size="md" onClick={resetPassword} disabled={loading}>{loading ? 'Resetting…' : 'Reset Password'}</Button>
            </Footer>
          </>
        )}

        {step === 'done' && (
          <>
            <Info tone="emerald">Your password has been updated. You can now log in with your new password.</Info>
            <Footer><Button variant="primary" size="md" onClick={() => onFinished(email)}>Back to Login</Button></Footer>
          </>
        )}
      </div>
    </Modal>
  );
}
