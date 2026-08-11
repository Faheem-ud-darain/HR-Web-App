'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useRouter } from 'next/navigation';
import { hrActions, useProfiles } from '@/lib/hrData';
import {
  setSession,
  generateSessionToken,
  getDeviceLabel,
  getRememberedEmail,
  setRememberedEmail,
  clearRememberedEmail,
  getSessionEmail,
  getSessionRole,
  hydrateSessionFromNativeStorage,
  isValidRole,
  dashboardSectionForRole,
  clearSession,
  getOrCreateDeviceId,
} from '@/lib/session';
import { API_BASE } from '@/lib/apiBase';
import { ArrowLeft, Eye, EyeOff, Mail, AlertTriangle, Smartphone } from 'lucide-react';
import { OtpInput } from '@/components/ui/OtpInput';

export default function AuthPage() {
  // Same cold-start problem as the root page: if the WebView happens to
  // (re)load straight at /auth (e.g. the user tapped "Sign In" from the
  // public page, or bookmarked it) while a valid session already exists,
  // skip the login form entirely instead of making them re-enter their
  // password. Kept separate from the root page's check (not shared state)
  // since either page can be the first one to mount.
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // True only when `error` is specifically the "already signed in
  // elsewhere" block — controls whether the "Log out from everywhere and
  // sign in here" button shows up under the error message. Any other error
  // (wrong password, offboarded, etc.) leaves this false.
  const [sessionConflict, setSessionConflict] = useState(false);
  const [notice, setNotice] = useState('');
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  // Forgot Password / OTP self-service flow — see
  // src/app/api/auth/forgot-password and src/app/api/auth/reset-password.
  // 'email' -> enter email, request a code; 'otp' -> enter the 6-digit code
  // + new password; 'done' -> success confirmation.
  const [forgotStep, setForgotStep] = useState<'email' | 'otp' | 'done'>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotShowPassword, setForgotShowPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [forgotError, setForgotError] = useState('');
  const [forgotInfo, setForgotInfo] = useState('');

  // Countdown timer for Resend OTP button rate limiting
  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setInterval(() => {
      setResendTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendTimer]);

  const resetForgotFlow = () => {
    setForgotStep('email');
    setForgotEmail('');
    setForgotOtp('');
    setForgotNewPassword('');
    setForgotConfirmPassword('');
    setForgotError('');
    setForgotInfo('');
    setForgotLoading(false);
    setResendLoading(false);
    setResendTimer(0);
  };

  const handleRequestOtp = async () => {
    setForgotError('');
    const clean = forgotEmail.trim().toLowerCase();
    if (!clean || !clean.includes('@')) {
      setForgotError('Enter a valid email address.');
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setForgotError(data?.error || 'Something went wrong. Please try again.');
        if (data?.waitSeconds) {
          setResendTimer(data.waitSeconds);
        }
        return;
      }
      setForgotInfo('If an account exists for that email, a 6-digit code has been sent — check your inbox (and spam folder).');
      setForgotStep('otp');
      const cooldown = data?.cooldownSec || 30;
      setResendTimer(cooldown);
    } catch (err) {
      console.error('[forgot-password] Fetch error in handleRequestOtp:', err);
      setForgotError('Could not reach the server. Check your connection and try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0 || resendLoading) return;
    setForgotError('');
    const clean = forgotEmail.trim().toLowerCase();
    if (!clean || !clean.includes('@')) {
      setForgotError('Enter a valid email address.');
      return;
    }
    setResendLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setForgotError(data?.error || 'Something went wrong sending a new code.');
        if (data?.waitSeconds) {
          setResendTimer(data.waitSeconds);
        }
        return;
      }
      setForgotInfo('A new 6-digit verification code has been sent to your email.');
      const cooldown = data?.cooldownSec || 60;
      setResendTimer(cooldown);
    } catch (err) {
      console.error('[forgot-password] Fetch error in handleResendOtp:', err);
      setForgotError('Could not reach the server. Check your connection and try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const handleSubmitReset = async () => {
    setForgotError('');
    if (!forgotOtp.trim() || forgotOtp.trim().length !== 6) {
      setForgotError('Enter the 6-digit code from your email.');
      return;
    }
    if (!forgotNewPassword || forgotNewPassword.length < 4) {
      setForgotError('Choose a password at least 4 characters long.');
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError('Passwords do not match.');
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail.trim().toLowerCase(),
          otp: forgotOtp.trim(),
          newPassword: forgotNewPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setForgotError(data?.error || 'Something went wrong. Please try again.');
        return;
      }
      setForgotStep('done');
    } catch {
      setForgotError('Could not reach the server. Check your connection and try again.');
    } finally {
      setForgotLoading(false);
    }
  };
  // Shown post-login (blocking navigation until acknowledged) when this
  // account's last shift was auto-ended by logging out — see
  // hrActions.performLogout in hrData.ts, which sets the localStorage flag
  // this checks for.
  const [shiftStoppedNotice, setShiftStoppedNotice] = useState(false);
  const [pendingDashRoute, setPendingDashRoute] = useState<string | null>(null);
  const router = useRouter();
  const { refetch: refetchProfiles } = useProfiles();

  // Boot-time session check (see the comment on `checkingSession` above).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await hydrateSessionFromNativeStorage();
      if (cancelled) return;

      const savedRole = getSessionRole();
      const savedEmail = getSessionEmail();
      console.log('[boot-session] auth page decision:', { savedRole, savedEmail });

      if (savedRole && savedEmail) {
        if (isValidRole(savedRole)) {
          router.replace(`/${dashboardSectionForRole(savedRole)}`);
          return; // stay on the loading state — navigation is taking over
        }
        // Unknown/corrupted role — don't route anywhere, just show the
        // login form as if there were no session.
        clearSession();
      }
      if (!cancelled) setCheckingSession(false);
    })();
    return () => { cancelled = true; };
  }, [router]);

  // Pre-fill the email field from a previous "Remember me" login — this is
  // the only thing that's actually remembered into the form itself; the
  // password is never stored anywhere (see the comment in lib/session.ts).
  // Survives an explicit logout, unlike the full session.
  useEffect(() => {
    const remembered = getRememberedEmail();
    if (remembered) setEmail(remembered);
  }, []);

  // Shown once after (dashboard)/layout.tsx force-logs-out a session it
  // detected was superseded by a login elsewhere (see the single-session
  // heartbeat effect there). Uses a one-shot sessionStorage flag rather than
  // a URL query param so this page doesn't need a Suspense boundary for
  // useSearchParams under this app's static export build.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.sessionStorage.getItem('session_superseded') === '1') {
      window.sessionStorage.removeItem('session_superseded');
      setNotice('You were logged out because this account was signed in from another device.');
    }
  }, []);

  // `force` skips the single-session live-check and unconditionally claims
  // the session slot instead — used by the "Log out from everywhere and
  // sign in here" button, which calls this directly (not via the form
  // submit) after the normal attempt already hit a conflict.
  const attemptLogin = async (force: boolean) => {
    setLoading(true);
    setError('');
    setSessionConflict(false);

    try {
      let role: 'admin' | 'hr' | 'employee' | 'team_lead' | null = null;

      let cleanEmail = email.trim().toLowerCase();
      // Admin override — the login credential (studiozsparx@gmail.com) is a
      // separate super-admin login and does NOT match any hr_profiles row,
      // so the actual admin record's email (admin@delcargo.us) must be
      // stored as the session identity. Otherwise every page that looks up
      // the current user's profile by email (e.g. /admin/profile) finds
      // nothing and gets stuck on "Loading profile…" forever.
      if (cleanEmail === 'studiozsparx@gmail.com' && password === 'Fah123@123') {
        role = 'admin';
        cleanEmail = 'admin@delcargo.us';
      } else if (cleanEmail === 'hr@delcargo.us' && password === 'HR@123') {
        role = 'hr';
      } else {
        // Fetch a fresh employee list on every login attempt (never rely on
        // a stale in-memory cache for a security-sensitive check).
        const { data: employees } = await refetchProfiles();
        const profile = (employees || []).find(emp => emp.email.toLowerCase() === cleanEmail);
        if (profile && (profile.password === password || (!profile.password && password === '123'))) {
          // `offboarded` isn't a real hr_profiles column — useProfiles()
          // already merges the per-profile KV overlay into each Profile, so
          // profile.offboarded is available directly here.
          if (profile.offboarded) {
            setError('This account has been deactivated / offboarded.');
            setLoading(false);
            return;
          }
          role = profile.role as any;
        }
      }

      if (role) {
        // Multi-device session enforcement — Employee/Team Lead accounts
        // only, up to MAX_USER_SESSION_DEVICES (2) at once. Admin/HR are
        // exempt and may sign in from as many places as they like. Checked
        // here, right before committing the login, using a fresh read so
        // this can't be bypassed by a stale in-memory value. Logging back
        // in on a device that's ALREADY one of the live slots is always
        // allowed regardless of the cap — only a genuinely new (3rd)
        // device gets blocked.
        const sessionToken = generateSessionToken();
        const deviceId = await getOrCreateDeviceId();
        if (role !== 'admin' && role !== 'hr' && !force) {
          const claim = await hrActions.claimUserSessionSlot(cleanEmail, deviceId, getDeviceLabel(), sessionToken);
          if (!claim.ok) {
            const labels = claim.liveSessions.map(s => s.deviceLabel || 'a device').join(' and ');
            setError(
              `This account is already signed in on 2 devices${labels ? ` (${labels})` : ''}. ` +
              'Please log out on one of them first, or log out from everywhere below.'
            );
            setSessionConflict(true);
            setLoading(false);
            return;
          }
          // claim.ok already persisted the slot — no separate claim call
          // needed below, unlike the old single-session flow.
          await setSession(cleanEmail, role, rememberMe, sessionToken);
          if (rememberMe) setRememberedEmail(cleanEmail);
          else clearRememberedEmail();
        } else {
          await setSession(cleanEmail, role, rememberMe, sessionToken);
          if (rememberMe) setRememberedEmail(cleanEmail);
          else clearRememberedEmail();
          if (role !== 'admin' && role !== 'hr') {
            if (force) {
              // "Log out from everywhere and sign in here" — wipe every
              // slot, then claim a fresh one for just this device.
              await hrActions.clearAllUserSessions(cleanEmail);
            }
            await hrActions.claimUserSessionSlot(cleanEmail, deviceId, getDeviceLabel(), sessionToken);
          }
        }
        // team_lead users share the employee dashboard
        const dashRoute = role === 'team_lead' ? 'employee' : role;

        // If their last logout auto-ended an in-progress shift, hold here
        // and make sure they actually see that before landing on the
        // dashboard, rather than it only showing up as an easy-to-miss
        // notification-bell badge.
        const stoppedFlagKey = `shift_auto_stopped_${cleanEmail}`;
        const wasStopped = typeof window !== 'undefined' && window.localStorage.getItem(stoppedFlagKey) === '1';
        if (wasStopped) {
          window.localStorage.removeItem(stoppedFlagKey);
          setPendingDashRoute(dashRoute);
          setShiftStoppedNotice(true);
          setLoading(false);
          return;
        }

        router.push(`/${dashRoute}`);
      } else {
        setError('Invalid email or password.');
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred while logging in.');
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    attemptLogin(false);
  };

  // "Log out from everywhere and sign in here" — re-runs the exact same
  // login attempt but with force=true, which clears EVERY device slot
  // (clearAllUserSessions) before claiming a fresh one for just this
  // device. Every other device's own heartbeat (see the multi-device
  // effect in (dashboard)/layout.tsx) then finds its slot gone and
  // force-logs it out next time it checks in — same mechanism, just
  // triggered deliberately instead of naturally aging out.
  const handleForceLoginEverywhere = () => attemptLogin(true);

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <svg className="animate-spin h-8 w-8 text-orange-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  return (
    // Uses arbitrary-value padding-top (below) instead of `p-4 pt-safe` —
    // both would set padding-top at the same cascade specificity; see
    // globals.css's .pt-safe comment for why that silently drops the fix.
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] font-sans fade-enter">
      <div className="w-full max-w-5xl mb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-orange-600 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
        </Link>
      </div>
      <Card className="w-full max-w-5xl bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 md:grid-cols-2 p-0">
        {/* Left Side: Premium Image Cover */}
        <div className="relative hidden md:flex flex-col justify-end p-8 bg-slate-900 overflow-hidden">
          <img 
            src="/delcargo_warehouse_hightech.png" 
            alt="Sign In Visual Cover" 
            className="absolute inset-0 w-full h-full object-cover opacity-75 object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/30 to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-36 bg-gradient-to-r from-transparent via-white/20 via-white/60 to-white z-10 pointer-events-none" />
          <div className="relative z-20 space-y-1">
            <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest bg-orange-500/10 border border-orange-500/20 px-3 py-1 rounded-full w-fit">
              DelCargo Portal
            </span>
            <h2 className="text-xl font-bold text-white uppercase tracking-wider mt-1" style={{ fontFamily: 'Georgia, serif' }}>
              Streamlining Supply Chains
            </h2>
          </div>
        </div>

        {/* Right Side: Form Content container */}
        <div className="p-8 sm:p-10 flex flex-col justify-center">
          <CardHeader className="text-center pb-2 p-0 mb-6">
            <div className="mx-auto bg-orange-600 h-11 w-11 rounded-xl flex items-center justify-center mb-4 shadow-md shadow-orange-500/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <CardTitle className="text-xl font-bold text-slate-900">Welcome back</CardTitle>
            <p className="text-xs text-slate-500 mt-1 font-semibold">Sign in to your HR Operations account</p>
          </CardHeader>
          <CardContent className="p-0">
            {notice && !error && (
              <div className="bg-amber-50 text-amber-700 p-3 rounded-lg text-sm font-semibold mb-4 border border-amber-100">
                {notice}
              </div>
            )}
            {error && (
              <div className="bg-rose-50 text-rose-600 p-3 rounded-lg text-sm font-semibold mb-4 border border-rose-100">
                <p>{error}</p>
                {sessionConflict && (
                  <button
                    type="button"
                    onClick={handleForceLoginEverywhere}
                    disabled={loading}
                    className="mt-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {loading ? 'Logging out everywhere…' : 'Log out from everywhere and sign in here'}
                  </button>
                )}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Email Address</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 rounded-xl outline-none text-xs font-semibold transition-colors text-slate-900"
                  placeholder="you@delcargo.us"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 pr-10 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 rounded-xl outline-none text-xs font-semibold transition-colors text-slate-900"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500 focus:ring-offset-0"
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={() => { resetForgotFlow(); setForgotEmail(email); setIsForgotOpen(true); }}
                    className="text-xs font-bold text-orange-600 hover:text-orange-700 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>
              <button
                type="submit" 
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 rounded-xl transition-colors transition-transform shadow-md shadow-orange-600/10 mt-4 disabled:opacity-70 flex justify-center items-center active:scale-97 text-xs uppercase tracking-wider"
              >
                {loading ? (
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : 'Sign In'}
              </button>
            </form>
          </CardContent>
        </div>
      </Card>


      <Link
        href="/privacy"
        className="mt-4 text-[11px] font-semibold text-slate-400 hover:text-orange-600 transition-colors"
      >
        Privacy Policy
      </Link>

      <Modal
        isOpen={isForgotOpen}
        onClose={() => { setIsForgotOpen(false); resetForgotFlow(); }}
        title={forgotStep === 'done' ? 'Password Reset' : 'Forgot Password'}
      >
        <div className="space-y-4">
          {forgotStep === 'email' && (
            <>
              <div className="flex items-start gap-3 bg-orange-50 border border-orange-100 p-4 rounded-xl">
                <Mail className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                  Enter your account email and we'll send a 6-digit code you can use to set a new password.
                </p>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">Email</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="you@delcargo.us"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              {forgotError && <p className="text-xs font-bold text-rose-600">{forgotError}</p>}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <p className="text-[11px] text-slate-400 font-semibold">Still stuck? Email hr@delcargo.us</p>
                <button
                  onClick={handleRequestOtp}
                  disabled={forgotLoading}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-colors transition-transform active:scale-97 disabled:opacity-60"
                >
                  {forgotLoading ? 'Sending…' : 'Send Code'}
                </button>
              </div>
            </>
          )}

          {forgotStep === 'otp' && (
            <>
              {forgotInfo && (
                <div className="flex items-start gap-3 bg-orange-50 border border-orange-100 p-4 rounded-xl">
                  <Mail className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-700 font-semibold leading-relaxed">{forgotInfo}</p>
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block text-center">6-digit security code</label>
                <OtpInput
                  length={6}
                  value={forgotOtp}
                  onChange={setForgotOtp}
                  disabled={forgotLoading || resendLoading}
                />
                <div className="flex items-center justify-between mt-2 px-1">
                  <span className="text-[11px] text-slate-400 font-medium">Didn't receive the code?</span>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendTimer > 0 || resendLoading || forgotLoading}
                    className="text-xs font-bold text-orange-600 hover:text-orange-700 disabled:text-slate-400 transition-colors flex items-center gap-1.5"
                  >
                    {resendLoading && (
                      <svg className="animate-spin h-3.5 w-3.5 text-orange-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    {resendLoading 
                      ? 'Sending code…' 
                      : resendTimer > 0 
                        ? `Resend in ${resendTimer}s` 
                        : 'Resend Code'}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">New password</label>
                <div className="relative">
                  <input
                    type={forgotShowPassword ? 'text' : 'password'}
                    value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-9 rounded-lg border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() => setForgotShowPassword(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {forgotShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">Confirm new password</label>
                <input
                  type={forgotShowPassword ? 'text' : 'password'}
                  value={forgotConfirmPassword}
                  onChange={(e) => setForgotConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              {forgotError && <p className="text-xs font-bold text-rose-600">{forgotError}</p>}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setForgotStep('email')}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700"
                >
                  Use a different email
                </button>
                <button
                  onClick={handleSubmitReset}
                  disabled={forgotLoading}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-colors transition-transform active:scale-97 disabled:opacity-60"
                >
                  {forgotLoading ? 'Resetting…' : 'Reset Password'}
                </button>
              </div>
            </>
          )}

          {forgotStep === 'done' && (
            <>
              <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                <Mail className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                  Your password has been updated. You can now log in with your new password.
                </p>
              </div>
              <div className="flex justify-end pt-2 border-t border-slate-200">
                <button
                  onClick={() => {
                    setEmail(forgotEmail);
                    setPassword('');
                    setIsForgotOpen(false);
                    resetForgotFlow();
                  }}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-colors transition-transform active:scale-97"
                >
                  Back to Login
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal isOpen={shiftStoppedNotice} onClose={() => {}} title="Shift Ended On Logout">
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 p-4 rounded-xl">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-700 font-semibold leading-relaxed">
              Your shift was still active when you last logged out, so it was automatically ended at that time. If you're continuing work, start a new shift from your dashboard.
            </p>
          </div>
          <div className="flex justify-end pt-2 border-t border-slate-200">
            <button
              onClick={() => {
                setShiftStoppedNotice(false);
                if (pendingDashRoute) router.push(`/${pendingDashRoute}`);
              }}
              className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-colors transition-transform active:scale-97"
            >
              Continue to Dashboard
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
