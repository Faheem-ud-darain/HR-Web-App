# 019 — SSO and multi-factor authentication

- **Status**: TODO
- **Commit**: (none yet — planning only)
- **Severity**: HIGH (standard procurement requirement for high-paying B2B/enterprise buyers)
- **Category**: Security / enterprise readiness
- **Estimated scope**: medium-large. New auth flows alongside the existing email+password login, not a replacement of it.

## Problem

Enterprise buyers routinely require, before signing a contract: (1) some
form of multi-factor authentication so a single leaked password can't
compromise an account, and (2) the option to log in via their own identity
provider (Google Workspace / Microsoft 365 are the two that cover the vast
majority of business buyers) rather than yet another password to manage.
Today this app has neither — plain email + password only (plus the Google
Calendar/Meet integration already present, which is a *feature*
integration, not a login/SSO mechanism, and doesn't touch authentication at
all).

## Target

- **MFA**: TOTP-based (Google Authenticator / Authy compatible) second
  factor, optional per-account initially, with a path to being enforced
  per-deployment for admin/HR roles at minimum (the roles with access to
  payroll and personal data).
- **SSO**: "Sign in with Google Workspace" as the first provider (matches
  the existing Google integration already in the codebase and covers a
  large share of business buyers), added as an *additional* login path
  alongside the existing email+password flow — not a replacement, since
  some clients won't use Google Workspace at all. Microsoft/Azure AD as a
  documented follow-up once the pattern is proven with Google.

## Repo conventions to follow

- Session issuance stays through the existing JWT mechanism in
  `serverAuth.ts` — SSO and MFA are additional steps *before* a session is
  issued, not a replacement of how sessions are verified afterward. Do not
  introduce a second session/token format.
- Match the existing Google OAuth callback pattern already in
  `src/app/api/auth/google/callback/route.ts` (used for calendar
  integration) for the *shape* of the OAuth exchange, but keep the scopes
  and purpose completely separate — a login-SSO OAuth grant must not
  reuse or piggyback on the calendar-integration grant's token/scope, to
  avoid accidentally granting calendar access as a side effect of just
  signing in, or vice versa.
- TOTP secret storage must go through the same PBKDF2-adjacent care as
  password hashing in `serverAuth.ts` — the secret itself should be
  encrypted at rest, not stored plaintext in `hr_profiles`, and must never
  be logged.
- Follow plan 013's rate-limiting helper for the MFA code-verification
  endpoint too — a 6-digit TOTP code is brute-forceable in a small number
  of attempts absent throttling, same reasoning as the password-reset OTP
  in that plan.

## Steps

1. **MFA enrollment flow**: generate a TOTP secret + QR code on an
   opt-in "Enable two-factor authentication" action in the profile pages
   (`admin/profile`, `hr/profile`, `employee/profile` — all three already
   exist), store the encrypted secret, require one successful code
   verification before enrollment is considered complete (avoids locking
   an account out from a mistyped setup).
2. **MFA login step**: after a successful password check in
   `src/app/api/auth/login/route.ts`, if the account has MFA enabled,
   require a valid TOTP code before issuing the session JWT — this is an
   additional gate inside the existing login route, not a new route.
3. **Recovery codes**: generate a set of one-time backup codes at
   enrollment (standard practice — losing a phone shouldn't permanently
   lock an account out), stored hashed (not plaintext) the same way
   passwords are.
4. **Google Workspace SSO**: add a distinct OAuth flow (separate client
   ID/scope from the existing calendar integration) that, on successful
   Google auth, looks up or creates the matching `hr_profiles` record by
   verified email and issues this app's own session JWT exactly as the
   password flow does today — from the session's perspective downstream,
   an SSO login and a password login are indistinguishable.
5. **Per-deployment enforcement setting**: add a deployment-level config
   flag (see plan 018's config approach) allowing a client to require MFA
   for admin/HR roles, without forcing it globally for every deployment on
   day one.

## Boundaries

- Do NOT replace email+password login — SSO and MFA are additions,
  existing accounts must keep working exactly as before unless a client
  explicitly enforces MFA.
- Do NOT reuse the existing Google Calendar OAuth grant/token for login
  SSO — separate client registration, separate scopes, to avoid scope
  confusion between "can log in as this person" and "can read/write this
  person's calendar."
- Do NOT build Microsoft/Azure AD SSO in this same plan — ship Google
  first, prove the pattern, then a follow-up plan adds Microsoft using the
  same shape.
- Do NOT store TOTP secrets or recovery codes in plaintext anywhere.

## Verification

- **Mechanical**: `npx tsc --noEmit -p tsconfig.json` clean.
- **Manual**: enroll a test account in MFA, log out, log back in, confirm
  the TOTP prompt appears and a correct code succeeds / an incorrect code
  fails and is rate-limited after repeated attempts.
- **Manual**: use a recovery code to log in, confirm it's single-use (a
  second attempt with the same code fails).
- **Manual**: complete a full Google Workspace SSO login for a test
  account, confirm it issues a normal app session (indistinguishable
  downstream from a password login) and does NOT also grant calendar
  access as a side effect.
- **Done when**: MFA enrollment/login/recovery all work end-to-end, Google
  Workspace SSO issues equivalent sessions to password login, and a
  deployment can optionally enforce MFA for admin/HR roles via config.
