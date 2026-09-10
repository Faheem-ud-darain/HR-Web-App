# 023 — Extend test coverage to a CI-gated suite (component + e2e)

- **Status**: TODO
- **Commit**: (none yet — planning only)
- **Severity**: MEDIUM
- **Category**: Codebase / completeness (extends plan 015)
- **Estimated scope**: large, ongoing. Sequenced after plan 015's initial unit-test foundation.

## Problem

Plan 015 deliberately scopes itself to unit tests for the highest-risk pure
computation (payroll math, absence detection, leave-day calculation,
timezone utilities) and explicitly defers component tests, end-to-end
tests, and CI enforcement as out of scope. For a product being sold to
paying enterprise clients, "we have some unit tests" is not the same
confidence level as "every release is verified by an automated suite
before it ships" — the latter is what "10/10, ready to showcase" actually
requires.

## Target

- Every plan 015 unit test, plus new coverage for: React Query hook
  behavior (cache invalidation, optimistic updates where used), critical
  form validation (onboarding, payroll edit, leave application), and the
  server-side API routes added across plans 012/013/019/020 (auth
  checks actually reject unauthorized roles, not just that they exist).
- A small set of end-to-end tests (Playwright) covering the core paths a
  demo/showcase to a prospective client would actually walk through:
  login, submit and approve a leave request, process payroll for a month,
  onboard a new employee, view the analytics dashboard.
- `npm test` (unit) and the e2e suite both run in CI on every PR, and a
  failing suite blocks merge — not just available to run manually.

## Repo conventions to follow

- Do not start this plan before plan 015's tooling (`vitest` config, test
  script) exists — this plan extends that foundation, it doesn't set up a
  parallel one.
- Playwright is the natural e2e choice given this session's environment
  already has Chromium pre-installed and configured for it (see this
  session's own environment notes) — reuse that setup rather than
  introducing a different browser automation tool.
- Structure e2e tests around realistic role-based scenarios (log in as
  HR, log in as Employee, log in as Admin) matching how the app's own
  role model already works, rather than testing implementation details.
- CI wiring belongs in `.github/workflows/`, as a new workflow file
  alongside the existing `build-tracker-agent.yml` /
  `deploy-pb-hooks.yml` / `diagnose-pb-hooks.yml`, matching their naming
  and trigger-on-PR conventions.

## Steps

1. Confirm plan 015 has landed (or land it as part of this plan if
   sequencing them together) — `vitest` installed, `npm test` working.
2. Add component/hook-level tests for the highest-traffic forms and React
   Query hooks — prioritize by what a prospective client demo would
   actually exercise (per Target's list).
3. Add API-route-level tests confirming role-based auth actually rejects
   an unauthorized caller (a session with the wrong role, or no session at
   all) for every route added by plans 012/013/019/020 as they land —
   this is arguably higher-value than happy-path testing, since it directly
   verifies the security work in those plans didn't quietly regress.
4. Install Playwright, write the 4-5 core-path e2e scenarios from Target.
5. Add a CI workflow running both suites on every PR, required to pass
   before merge.

## Boundaries

- Do NOT attempt exhaustive e2e coverage of every page/feature — the 4-5
  scenarios in Target are deliberately the highest-value "this is what a
  demo looks like" paths, not full coverage; broader e2e expansion is a
  further follow-up, not a blocker for this plan's "Done."
- Do NOT let a flaky e2e test block merges without investigation — a
  suite the team learns to ignore or re-run-until-green is worse than no
  CI gate at all; fix or remove a consistently flaky test rather than
  leaving it in a broken state.
- Do NOT couple this plan's CI gate to plans that haven't landed yet
  (e.g. don't write auth-rejection tests for plan 020's audit log routes
  before plan 020 actually exists) — test what's actually been built.

## Verification

- **Mechanical**: `npm test` and the Playwright suite both pass locally.
- **Mechanical**: a deliberately-introduced bug (e.g. removing an auth
  check from one API route) causes the corresponding test to fail — a
  genuine red/green confirmation the tests aren't passing trivially.
- **Mechanical**: CI blocks a PR with a failing test from being merged.
- **Done when**: the 4-5 core e2e scenarios pass reliably, API-route auth
  checks are tested for every route that has one, and CI enforces both
  suites on every PR.
