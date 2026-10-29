'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { PublicPage } from '@/components/landing/PublicPage';
import { Globe } from '@/components/landing/Globe';
import { NoticeModal } from '@/components/ui/NoticeModal';
import { ForgotPasswordModal } from './_components/ForgotPasswordModal';
import { useRouter } from 'next/navigation';
import { hrActions } from '@/lib/hrData';
import {
  setSession,
  setAuthToken,
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
import { EyeIcon as Eye, EyeSlashIcon as EyeOff, WarningIcon as AlertTriangle } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/Spinner';
import { Input } from '@/components/ui/Input';
import { FieldLabel } from '@/components/ui/FieldLabel';

let supersededFlag: boolean | null = null;
/** Reads and clears the "your session was superseded" flag the first time, then remembers the answer. */
function readSupersededFlagOnce(): boolean {
  if (supersededFlag === null) {
    supersededFlag = typeof window !== 'undefined' && window.sessionStorage.getItem('session_superseded') === '1';
    if (supersededFlag) window.sessionStorage.removeItem('session_superseded');
  }
  return supersededFlag;
}

export default function AuthPage() {
  // Same cold-start problem as the root page: if the WebView happens to
  // (re)load straight at /auth (e.g. the user tapped "Sign In" from the
  // public page, or bookmarked it) while a valid session already exists,
  // skip the login form entirely instead of making them re-enter their
  // password. Kept separate from the root page's check (not shared state)
  // since either page can be the first one to mount.
  const [checkingSession, setCheckingSession] = useState(true);
  // Pre-filled from a previous "Remember me" login (only the email is ever remembered —
  // never the password; see lib/session.ts). Read straight from storage in the browser
  // (empty on the server), and replaced as soon as the person types.
  const [typedEmail, setEmail] = useState<string | null>(null);
  const rememberedEmail = useSyncExternalStore(() => () => {}, () => getRememberedEmail() || '', () => '');
  const email = typedEmail ?? rememberedEmail;
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
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  // Shown post-login (blocking navigation until acknowledged) when this
  // account's last shift was auto-ended by logging out — see
  // hrActions.performLogout in hrData.ts, which sets the localStorage flag
  // this checks for.
  const [shiftStoppedNotice, setShiftStoppedNotice] = useState(false);
  const [pendingDashRoute, setPendingDashRoute] = useState<string | null>(null);
  const router = useRouter();

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

  // Shown once after (dashboard)/layout.tsx force-logs-out a session it detected was
  // superseded by a login elsewhere (see the single-session heartbeat effect there).
  // Uses a one-shot sessionStorage flag rather than a URL query param so this page
  // doesn't need a Suspense boundary for useSearchParams under this app's static
  // export build. The flag is read (and cleared) once per page load.
  const supersededNotice = useSyncExternalStore(() => () => {}, readSupersededFlagOnce, () => false);
  const notice = supersededNotice ? 'You were logged out because this account was signed in from another device.' : '';

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
      let authToken: string | null = null;

      // Credential check now happens entirely server-side (see
      // src/app/api/auth/login/route.ts) — this used to be a client-side
      // comparison against every employee's plaintext password (fetched, in
      // full, into the browser via refetchProfiles()) plus two hardcoded
      // super-admin/HR credentials sitting in this file's own shipped JS.
      // Neither of those things happens here anymore: the browser only ever
      // sends the attempted email/password and gets back a role + a signed
      // session token, never anyone's actual password.
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Invalid email or password.');
        setLoading(false);
        return;
      }
      role = data.role;
      cleanEmail = data.email; // server resolves the real session identity (e.g. the super-admin alias -> admin@delcargo.us)
      authToken = data.token;

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
          if (authToken) setAuthToken(authToken, rememberMe);
          if (rememberMe) setRememberedEmail(cleanEmail);
          else clearRememberedEmail();
        } else {
          await setSession(cleanEmail, role, rememberMe, sessionToken);
          if (authToken) setAuthToken(authToken, rememberMe);
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
      <PageLoader />
    );
  }

  return (
    <PublicPage badge="Sign In" signIn={false}>
      <div className="fade-enter mx-auto w-full max-w-6xl px-4 sm:px-8 pt-8 sm:pt-12 grid gap-6 lg:grid-cols-2 lg:gap-10">
        {/* The panel: what the portal is for, and the globe rising under it. */}
        <div className="relative hidden lg:flex min-h-[34rem] flex-col overflow-hidden rounded-3xl bg-ink/5 p-10">
          <div className="relative space-y-1">
            <p className="text-caption font-bold uppercase tracking-widest text-brand">DelCargo Portal</p>
            <p className="font-display text-3xl xl:text-4xl font-black uppercase tracking-tight text-ink leading-[0.95]">Streamlining Supply Chains</p>
          </div>
          <Globe className="absolute left-[-6%] top-[27%] w-[112%]" />
        </div>

        {/* The form. */}
        <div className="flex flex-col justify-center py-6 lg:px-6">
          <div className="mx-auto w-full max-w-md space-y-8">
            <div className="space-y-2">
              <h1 className="font-display font-black text-balance text-4xl sm:text-5xl leading-[0.95] tracking-[-0.03em] text-ink">Welcome back</h1>
              <p className="text-base text-ink/70">Sign in to your HR Operations account</p>
            </div>
            <div>
            {notice && !error && (
              <div className="bg-amber-50 text-amber-700 p-3 rounded-lg text-sm font-semibold mb-4 border border-amber-100">
                {notice}
              </div>
            )}
            {error && (
              <div className="bg-rose-50 text-rose-600 p-3 rounded-lg text-sm font-semibold mb-4 border border-rose-100">
                <p>{error}</p>
                {sessionConflict && (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={handleForceLoginEverywhere}
                    disabled={loading}
                    className="mt-2"
                  >
                    {loading ? 'Logging out everywhere…' : 'Log out from everywhere and sign in here'}
                  </Button>
                )}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <FieldLabel size="md">Email Address</FieldLabel>
                <Input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  fieldSize="lg" className="hover:bg-slate-100/50 focus:bg-white focus:ring-2 focus:ring-orange-100 transition-colors text-slate-900"
                  placeholder="you@delcargo.us"
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel size="md">Password</FieldLabel>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    fieldSize="lg" className="pr-10 hover:bg-slate-100/50 focus:bg-white focus:ring-2 focus:ring-orange-100 transition-colors text-slate-900"
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
                    onClick={() => setIsForgotOpen(true)}
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
          </div>
          </div>
        </div>
      </div>

      {isForgotOpen && (
        <ForgotPasswordModal
          initialEmail={email}
          onClose={() => setIsForgotOpen(false)}
          onFinished={resetEmail => { setEmail(resetEmail); setPassword(''); setIsForgotOpen(false); }}
        />
      )}

      {shiftStoppedNotice && (
        <NoticeModal
          title="Shift Ended On Logout"
          tone="amber"
          icon={AlertTriangle}
          action={{ label: 'Continue to Dashboard', onClick: () => { setShiftStoppedNotice(false); if (pendingDashRoute) router.push(`/${pendingDashRoute}`); } }}
          closeLabel={null}
          onClose={() => {}}
        >
          Your shift was still active when you last logged out, so it was automatically ended at that time. If you&apos;re continuing work, start a new shift from your dashboard.
        </NoticeModal>
      )}
    </PublicPage>
  );
}
