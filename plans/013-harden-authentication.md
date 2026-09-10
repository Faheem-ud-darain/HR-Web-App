# 013 — Harden authentication (default passwords, rate limiting, security headers)

- **Status**: TODO
- **Commit**: (none yet — planning only)
- **Severity**: HIGH
- **Category**: Security (not part of the animation audit — tracked here for the same reason plans 007-011 are)
- **Estimated scope**: small-medium. Touches `src/app/api/auth/*`, `src/app/api/admin/profile/route.ts`, and `next.config.ts` (or middleware). No schema changes.

## Problem

Three separate, independent auth weaknesses found during the 10-category
audit that produced this plan:

1. **Hardcoded default password**: `src/app/api/admin/profile/route.ts`
   (line ~230) falls back to the literal string `'123'` when an admin
   creates/edits a profile without setting a password, and
   `src/app/api/auth/login/route.ts` (~line 79) treats `password === '123'`
   as valid for any account that has no password hash set yet.

   **Confirmed with the product owner: this default-password step is
   intentional, not accidental.** The real workflow is: HR/Admin creates
   the account on the employee's behalf (the employee never picks their
   own initial password); the employee logs in with the shared default
   during onboarding; HR/Admin reviews and approves the account once
   onboarding steps are complete; only *after* approval is the employee
   expected to set their own password. So this plan must not remove or
   block that flow. What actually needs fixing is narrower: `'123'` is
   one universal, publicly-known literal shared by every not-yet-approved
   account across every deployment (rather than a per-account secret),
   and there is no mechanism that ever forces the password to actually
   change after approval — an employee who never bothers keeps `123`
   indefinitely, and the account remains vulnerable to anyone who simply
   knows the app's own default-password convention.
2. **No rate limiting anywhere**: `src/app/api/auth/login`,
   `src/app/api/auth/forgot-password`, and
   `src/app/api/auth/verify-reset-otp` have no request throttling of any
   kind. The login endpoint is brute-forceable at whatever rate the
   attacker's network allows; the OTP verification endpoint is
   particularly exposed since OTPs are typically short (4-6 digits) and
   thus brute-forceable in a small number of attempts absent throttling.
3. **No security response headers**: no Content-Security-Policy,
   X-Frame-Options, X-Content-Type-Options, or Referrer-Policy configured
   anywhere in `next.config.ts` or middleware — the app has no defense
   against clickjacking (embedding the login page in an invisible iframe)
   or MIME-sniffing attacks, and no CSP to limit what a successful XSS
   could actually reach.

## Target

- No account is ever protected only by a single, universal, guessable
  literal (`'123'`, shared across every pending account in every
  deployment). New accounts still get an HR/Admin-set temporary password
  exactly as today — but generated per-account (already partially
  supported — `admin/onboarding` has a "Temporary Password" field; the
  fix is removing the shared `'123'` fallback path so no empty/unset
  password can ever authenticate via a literal every account shares).
- The existing lifecycle is preserved exactly: account created by
  HR/Admin with a temp password → employee logs in and completes
  onboarding using that temp password → HR/Admin reviews and approves →
  only then is the employee expected/allowed to set their own password.
  A forced password-change gate belongs **after approval**, not at first
  login (first login has to work with the temp password *during*
  onboarding, before approval exists) — see Steps below.
- Login, forgot-password, and OTP-verification endpoints reject excessive
  attempts from the same identifier (email and/or IP) within a rolling
  window, with a clear "too many attempts, try again in N minutes"
  response rather than silently continuing to accept guesses.
- Standard security headers are present on every response:
  `Content-Security-Policy` (start permissive enough not to break existing
  inline scripts/styles/CDN usage — audit what's actually loaded before
  tightening), `X-Frame-Options: DENY` (or `frame-ancestors 'none'` in
  CSP), `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`.

## Repo conventions to follow

- Follow `src/lib/serverAuth.ts`'s existing PBKDF2 implementation for any
  new password-related code — do not introduce bcryptjs (see that file's
  own comment on why it breaks under the Edge runtime).
- Rate limiting needs an Edge-runtime-compatible store — this app has no
  Redis/external store today. The simplest fit with existing conventions
  is reusing the same KV-style helpers already used elsewhere
  (`adminGetKV`/`adminSetKV` in `pbAdmin.ts`, used by the screenshot
  retention route) to store a per-identifier attempt counter + window
  start timestamp; keyed e.g. `login_ratelimit_<email or ip>`. This avoids
  adding a new infrastructure dependency.
- Security headers belong in `next.config.ts`'s `headers()` function
  (Next.js's standard mechanism) rather than per-route — set once,
  applies everywhere, matches how `env`/`images` are already configured
  centrally in that file.
- Any change to the login route must preserve every currently-supported
  login path (see its existing comments) — read the whole file before
  editing, not just the `'123'` fallback line.

## Steps

1. **Remove the hardcoded default password fallback.** In
   `src/app/api/admin/profile/route.ts`, replace the `'123'` literal with
   a securely generated random temporary password (e.g. via
   `crypto.getRandomValues`, formatted for readability) whenever no
   password is supplied — surface it back to the admin in the response so
   they can communicate it to the new hire, the same way the existing
   "Temporary Password" field already does when explicitly set. In
   `src/app/api/auth/login/route.ts`, remove the `password === '123'`
   special case entirely — an account with no password hash should never
   be able to authenticate via a magic literal.
2. **Add a forced password-change gate that fires on approval, not on
   first login.** Check the existing onboarding/approval flow
   (`UserProfileModal.tsx` / the account-approval action) for where an
   account transitions from "pending onboarding" to "approved," and hook
   the gate there: once HR/Admin approves the account, flag it as
   requiring a password change on its employee's *next* login (a simple
   `mustChangePassword` overlay flag, same KV/overlay pattern already
   used for `offboarded`/`offboardingStatus`). The employee must still be
   able to log in freely with the temp password throughout onboarding,
   before approval — do not gate that.
3. **Add rate limiting** to `src/app/api/auth/login/route.ts`,
   `src/app/api/auth/forgot-password/route.ts`, and
   `src/app/api/auth/verify-reset-otp/route.ts`: a small shared helper
   (e.g. `src/lib/rateLimit.ts`) that checks/increments a KV-backed
   counter per identifier, returns whether the request should be blocked,
   and resets after the window expires. Suggested starting thresholds —
   flag as needing product-owner sign-off, not a hard requirement: 5
   attempts per 15 minutes for login, 3 per hour for forgot-password, 5
   per 10 minutes for OTP verification (OTPs should also already expire —
   confirm `verify-reset-otp`'s existing expiry logic and don't duplicate
   it).
4. **Add security headers** in `next.config.ts`'s `headers()` — start with
   `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: strict-origin-when-cross-origin` (low-risk, unlikely
   to break anything). For CSP specifically: first audit exactly what
   external scripts/styles/fonts/images the app actually loads (OneSignal,
   Google Fonts if any, PocketBase's own domain, any CDN) and write a CSP
   that allowlists precisely those — do not ship a CSP that breaks
   OneSignal push or any other integration; test thoroughly in a
   non-production environment before considering it done.

## Boundaries

- Do NOT change the shape of the JWT session token or its verification
  logic in `serverAuth.ts` — this plan only touches login validation
  (the `'123'` check), not session issuance/verification.
- Do NOT remove or gate the ability to log in with the HR/Admin-set temp
  password during onboarding, before approval — that is the intended,
  confirmed workflow. Only the *shared, universal* nature of the literal
  and the *lack of a forced change after approval* are the bugs.
- Do NOT introduce a new external service (Redis, Cloudflare Turnstile,
  etc.) for rate limiting — use the existing KV-store pattern already in
  this codebase, per Repo conventions above.
- Do NOT ship a CSP that hasn't been verified against a live test of every
  page that uses OneSignal push, since that's the one third-party script
  confirmed present via console errors during this session's own testing.
- Do NOT change `hr_profiles`' password field storage format
  (`pbkdf2$<iterations>$<salt>$<hash>`) — only the login-time comparison
  and the profile-creation default-password logic.

## Verification

- **Mechanical**: `npx tsc --noEmit -p tsconfig.json` clean.
- **Manual**: attempt login with `'123'` against an account with no
  password set — confirm it now fails.
- **Manual**: submit 6+ rapid failed login attempts for one account,
  confirm the 6th+ is rejected with a clear rate-limit message rather than
  silently evaluated.
- **Manual**: submit 6+ rapid OTP-verification attempts, confirm the same.
- **Manual**: with the security headers live, open the app in a browser
  dev tools Network tab and confirm `X-Frame-Options`,
  `X-Content-Type-Options`, and `Referrer-Policy` are present on the
  document response; confirm OneSignal push and every other integration
  still functions with the new CSP in place.
- **Done when**: no account can ever authenticate via a predictable
  default password, all three auth endpoints throttle excessive attempts,
  and standard security headers are present without breaking any existing
  feature.
