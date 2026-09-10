# 024 — Dependency scanning and PocketBase schema version control

- **Status**: TODO
- **Commit**: (none yet — planning only)
- **Severity**: MEDIUM
- **Category**: Security / database
- **Estimated scope**: small-medium. Mostly tooling/process, not application logic.

## Problem

Two independent gaps found during audit that both fall under "can we trust
what's actually deployed":

1. **No dependency vulnerability scanning.** `npm audit` is not run
   anywhere (not in CI, not documented as a manual step), and there's no
   Dependabot or equivalent configured. A known-vulnerable version of any
   dependency (this app has ~15 direct dependencies plus their transitive
   trees) could sit in production indefinitely with nothing flagging it.
2. **No tracked PocketBase schema/migrations.** There is no
   `pb_migrations` directory (or equivalent) in this repo — the actual
   shape of every `hr_*` collection (fields, types, rules) exists only
   live on the PocketBase droplet's admin UI, with no version history, no
   code review trail for schema changes, and no way to reproduce the exact
   schema when standing up a new client's instance (directly relevant to
   plan 021's repeatable-deployment goal — a new deployment currently has
   no source of truth for what collections/fields to create).

## Target

- Automated dependency scanning runs on a schedule (Dependabot, or a CI
  job running `npm audit --audit-level=high` at minimum) and surfaces
  actionable alerts, not just a report nobody reads.
- Every PocketBase collection's schema is exported and committed as
  PocketBase migration files (`pb_migrations/*.js` — PocketBase supports
  exporting/generating these), so the schema has real version history,
  goes through the same review process as any other code change, and can
  be replayed to stand up a new client's instance identically.

## Repo conventions to follow

- Match the existing `.github/workflows/` naming/trigger conventions for
  any new scanning workflow.
- PocketBase migrations should be generated using PocketBase's own
  migration-generation tooling against the real droplet's current schema
  as the starting snapshot (so the first migration file accurately
  reflects what's actually deployed today, not a guess) — verify this
  matches the same PocketBase version already documented in
  `pb_hooks/*.pb.js`'s comments (pre-v0.23 JS hooks API).
- Feed the exported migrations directly into plan 021's containerized
  deployment process — a new client's PocketBase instance should apply
  these migrations as part of setup, not have its schema recreated by
  hand.

## Steps

1. Enable Dependabot (or equivalent) for this repo, configured for npm
   dependencies at minimum; add a CI job running `npm audit
   --audit-level=high` that fails the build on high/critical findings.
2. Generate PocketBase migration files reflecting the current live schema
   of every `hr_*` collection (and `users`/`warehouse`/`packages`/
   `login_history`), committed under `pb_migrations/`.
3. Verify the migrations actually reproduce the schema correctly by
   applying them to a fresh, empty PocketBase instance and diffing its
   resulting schema against the real production schema.
4. Document the process for making a future schema change: edit via
   migration file (or generate one from an admin-UI change), never a
   silent unlogged change directly on a client's production droplet.

## Boundaries

- Do NOT change any existing collection's fields or rules as part of this
  plan — this plan captures the current schema as version-controlled
  migrations, it does not modify what that schema is (rule changes belong
  to plan 012).
- Do NOT auto-merge Dependabot PRs without review — a dependency bump can
  itself introduce breakage (as this codebase's own history shows with
  bcryptjs's Edge-runtime incompatibility); flag and review, don't
  blindly auto-update.
- Do NOT couple this plan to plan 021 landing first — migrations can be
  generated and committed now, and simply get consumed by 021's
  deployment tooling whenever that lands.

## Verification

- **Mechanical**: Dependabot/`npm audit` CI job runs and correctly flags
  a deliberately-introduced known-vulnerable dependency version in a test
  branch.
- **Mechanical**: applying the committed `pb_migrations/` to a fresh
  PocketBase instance produces a schema matching production, verified via
  a diff of collection definitions.
- **Done when**: dependency scanning runs automatically and surfaces real
  findings, and the full PocketBase schema exists as reviewable,
  replayable migration files in this repo.
