# 025 — Client-facing documentation and deployment runbook

- **Status**: TODO
- **Commit**: (none yet — planning only)
- **Severity**: MEDIUM
- **Category**: Completeness / multi-client readiness
- **Estimated scope**: medium. Almost entirely documentation, drawing together the setup steps introduced by plans 018/021/024.

## Problem

`CLAUDE.md` is a single line pointing at `AGENTS.md`, and `AGENTS.md` is 5
lines of generic Next.js-version warning — neither is real onboarding
documentation. `Notes/DEPLOY_PB_HOOKS_SETUP.md` is the one genuinely good
piece of setup documentation in the repo, but it covers only one narrow
slice (auto-deploying `pb_hooks` changes) of what's needed to actually
stand up a new client's deployment from scratch. Given the confirmed sales
model (each client deploys their own instance), there is currently no
single document that walks someone through everything required to take
this codebase and stand up a working, correctly-configured, correctly-
branded instance for a brand-new client — that knowledge exists only in
this session's and prior sessions' heads.

## Target

- A real deployment runbook (`Notes/NEW_CLIENT_DEPLOYMENT.md` or similar)
  covering, in order: provisioning the PocketBase droplet (or container,
  once plan 021 lands), applying the schema migrations (plan 024),
  configuring the white-label/region/currency settings (plan 018),
  setting up the GitHub Actions secrets for `pb_hooks` deployment
  (already documented, just needs to be referenced/linked rather than
  duplicated), configuring backups (plan 021), and a final smoke-test
  checklist confirming the new instance actually works end-to-end before
  handing it to the client.
- A short admin-user guide (for the client's own HR/Admin staff, not
  developers) covering the core workflows: onboarding an employee,
  processing payroll, approving leave, reviewing the analytics dashboard
  — the kind of material that gets handed to a new client's HR team on
  day one, and that also functions as showcase/sales material
  demonstrating the product is a real, documented, professional offering.
- `CLAUDE.md`/`AGENTS.md` actually reflect this codebase's real
  conventions (the plans/ folder workflow, the tsc-after-every-change
  discipline, the "don't force a fit" philosophy from plan 011, the
  device-bash-only repo-access note) rather than being empty stubs — so a
  future session (or a new developer) has real, current guidance instead
  of having to reconstruct it from reading plan files.

## Repo conventions to follow

- Match `Notes/DEPLOY_PB_HOOKS_SETUP.md`'s existing documentation style
  (numbered steps, exact commands, explains *why*) for the new deployment
  runbook — it's the one existing example of this repo doing
  documentation well; extend that quality bar rather than writing
  something less thorough.
- Do not duplicate content that already exists and is correct (e.g. the
  `pb_hooks` GitHub Actions secret setup) — link/reference it from the
  new runbook instead of copy-pasting it, so it doesn't drift out of sync
  when the original gets updated.
- Sequence this plan last among 018/021/024/025, or write it in parallel
  and finalize once those land — a deployment runbook referencing steps
  that don't exist yet isn't useful; a placeholder/draft version can start
  earlier and get filled in as each dependency plan completes.

## Steps

1. Write the new-client deployment runbook, structured as a literal
   step-by-step checklist someone unfamiliar with the codebase could
   follow start to finish.
2. Write the admin-user guide covering the 4-5 core workflows listed in
   Target, written for a non-technical HR audience.
3. Rewrite `CLAUDE.md`/`AGENTS.md` to reflect this repo's actual
   conventions: the `plans/` folder workflow (numbered plans, Status/
   Severity/Steps/Boundaries/Verification structure), the discipline of
   running `tsc` after every change, the repo-access note (this
   codebase is worked on exclusively via a device-bash-style remote shell
   in this session's own history, if that continues to be true for future
   sessions), and a pointer to `plans/README.md` as the source of truth
   for what's done/in-progress/planned.
4. Do a full dry run of the deployment runbook with someone who didn't
   write it (or, at minimum, re-derive it from scratch against a fresh
   environment) to catch any step that only makes sense because the
   author already knew what to do.

## Boundaries

- Do NOT write marketing copy or a sales pitch as part of this plan — the
  admin-user guide should be genuinely useful documentation, not sales
  collateral (though it can certainly double as evidence of a
  professional product during a sales conversation).
- Do NOT let this plan block on every one of 018/021/024 being fully
  complete — start the runbook now with clearly marked placeholder
  sections for steps that depend on those plans, and fill them in as each
  lands, rather than waiting for all three before writing anything.

## Verification

- **Manual**: have someone unfamiliar with the deployment process follow
  the runbook step by step and successfully stand up a working instance,
  noting any point of confusion or missing step.
- **Manual**: have someone read the admin-user guide and successfully
  complete each of the 4-5 core workflows without additional help.
- **Done when**: the deployment runbook has been proven to work via a real
  dry run, the admin-user guide covers the core workflows clearly, and
  `CLAUDE.md`/`AGENTS.md` reflect this repo's actual, current conventions.
