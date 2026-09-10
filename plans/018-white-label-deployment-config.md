# 018 — Remove hardcoded DelCargo-specific config (white-label / per-client deployment readiness)

- **Status**: TODO
- **Commit**: (none yet — planning only)
- **Severity**: CRITICAL (blocks selling to any other company as-is)
- **Category**: Structure / multi-client readiness
- **Estimated scope**: large, mechanical-but-pervasive. Confirmed via audit: 34 files reference "delcargo"/"DelCargo" directly; `pb.delcargo.us` is hardcoded as a literal string inside several `fetch()` calls in `hrData.ts` (not even routed through the existing `NEXT_PUBLIC_PB_URL` env var used elsewhere); the `region` field is a hardcoded `'USA' | 'Pakistan'` union throughout the codebase; `formatMoney` hardcodes `$` vs `PKR` by name.

## Problem

This app was built for exactly one company and it shows structurally, not
just cosmetically. Per the confirmed decision to sell this as
**self-hosted-per-client** (each company deploys their own instance/servers/
database, not a shared multi-tenant system), the codebase itself doesn't
need tenant isolation — but it does need to stop being DelCargo-specific,
because right now a new client deploying this would see "DelCargo" branding
baked into the UI, `region` limited to exactly USA/Pakistan regardless of
where their employees actually are, and currency formatting hardcoded to
USD/PKR regardless of what currencies that client actually pays in. None of
that is configurable per deployment today — it's all literal strings and a
2-value union type scattered across dozens of files.

Separately (a correctness bug independent of white-labeling):
`pb.delcargo.us` appears as a raw string literal in at least 3 places in
`hrData.ts` (team chat message endpoints), bypassing the
`NEXT_PUBLIC_PB_URL` env var that every other PocketBase call in the app
correctly uses. A new deployment pointing at a different PocketBase
instance would have those 3 endpoints silently still hit DelCargo's own
production server.

## Target

- A single, well-documented deployment config (env vars, following the
  existing `.env.example` pattern) covers: company display name, logo,
  primary accent color (if brand color needs to vary per client — confirm
  whether clients need this or a fixed accent is acceptable), support
  contact info, and the PocketBase URL (already exists as
  `NEXT_PUBLIC_PB_URL` — this plan's job is making sure literally every
  PocketBase call in the app uses it, with zero raw `pb.delcargo.us` /
  `hub.delcargo.us` literals remaining anywhere in `src`).
- `region` becomes a configurable list of named regions with their own
  currency, not a hardcoded 2-value union — a client operating in, say,
  Canada and the UK should be able to configure "Canada (CAD)" / "UK
  (GBP)" without a code change. `formatMoney` and every other
  region-branching function (`onboardingPenalty`, announcement targeting,
  etc.) reads from this config instead of comparing against literal
  `'USA'`/`'Pakistan'` strings.
- One `npm run new-client-setup` (or equivalent documented process, see
  plan 025) walks a fresh deployment through setting these values before
  first use.

## Repo conventions to follow

- Follow the existing `.env.example` convention for any new env var — it
  already documents `NEXT_PUBLIC_PB_URL` and others; extend that file
  rather than inventing a separate config mechanism.
- Do not touch `computePayrollView`'s actual proration/increment math —
  only the region/currency *identity* it operates on, per the "no behavior
  change" discipline every structural plan in this series has followed.
- Region config should be typed as a real TypeScript type generated from
  (or validated against) the deployment's configured region list, not a
  loose `string`, so the compiler still catches a typo'd region name at
  every call site — this is exactly the kind of change plan 014's
  domain-module split makes easier to do safely, so sequence this plan
  after 014 if both are in flight.
- Every literal DelCargo reference found via
  `grep -rn "delcargo" src --include="*.ts" --include="*.tsx" -i` must be
  either genuinely deployment-specific (moved to env/config) or a comment
  documenting real production history (e.g. the `zara@delcargo.us`
  incident comment in `hrData.ts` — that's institutional history, not
  hardcoding, and should stay as a comment but never as executable logic).

## Steps

1. Inventory every hardcoded DelCargo reference
   (`grep -rn "delcargo" src -i`) and classify each: (a) branding/display
   text → move to config, (b) hardcoded PocketBase URL literal → replace
   with `NEXT_PUBLIC_PB_URL`, (c) historical comment → leave as-is.
2. Fix the 3 confirmed raw `pb.delcargo.us` literals in `hrData.ts`'s team
   chat message endpoints first — this is a real bug (not just a
   white-label concern) independent of everything else in this plan.
3. Introduce a typed region/currency config (e.g.
   `src/lib/deploymentConfig.ts`, env-driven) replacing the `'USA' |
   'Pakistan'` union; migrate every call site that branches on region
   (`formatMoney`, onboarding penalty, announcement targeting, and any
   others found via `grep -n "region ===" src -r`).
4. Move branding (company name, logo path, support email) into the same
   config, replacing literal "DelCargo"/"DelCargo HR" strings in UI copy
   and `<title>`/metadata.
5. Document the full list of required setup values in `.env.example` with
   inline comments explaining each (feeds directly into plan 025's
   deployment runbook).

## Boundaries

- Do NOT build a shared multi-tenant architecture (single DB serving
  multiple companies) — the confirmed model is one dedicated deployment
  per client, so this plan's job is making one deployment easily
  reconfigurable for a *different* single client, not serving many at
  once.
- Do NOT change any payroll/absence/leave math — only the
  region/currency/branding *identity* layer around it.
- Do NOT do this in one commit — batch by concern (URL literals first as
  a standalone bugfix, then region/currency config, then branding) so each
  is independently reviewable.

## Verification

- **Mechanical**: `npx tsc --noEmit -p tsconfig.json` clean after every
  batch.
- **Mechanical**: `grep -rn "delcargo" src -i` after the full pass returns
  only historical comments, zero executable logic or hardcoded URLs.
- **Manual**: point `NEXT_PUBLIC_PB_URL` at a second, throwaway PocketBase
  instance locally and confirm every feature (including team chat) talks
  to that instance, not `pb.delcargo.us`.
- **Manual**: configure a region/currency pair that isn't USA/Pakistan and
  confirm payroll, announcements, and onboarding all correctly use it with
  zero code changes.
- **Done when**: a fresh clone of this repo, given a new set of env values
  and zero code changes, deploys as a fully working, correctly-branded,
  correctly-currencied instance for a different company.
