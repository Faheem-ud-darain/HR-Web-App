# 021 — Backups, disaster recovery, and repeatable per-client deployment

- **Status**: TODO
- **Commit**: (none yet — planning only)
- **Severity**: HIGH
- **Category**: Server / operational readiness
- **Estimated scope**: medium. Infrastructure/process work more than application code — some scripting, mostly documentation and tooling around the existing droplet-based deployment.

## Problem

Confirmed via audit: no backup process is documented or referenced
anywhere in this repo. The existing deployment model is one PocketBase
droplet, set up and maintained by hand over SSH (`Notes/
DEPLOY_PB_HOOKS_SETUP.md` documents `pb_hooks` deployment via GitHub
Actions, but nothing documents database backups, restore procedure, or
disaster recovery). Given the confirmed sales model — **each client
deploys their own instance/servers/database** — this problem multiplies:
instead of one droplet to keep safe, there will eventually be one per
paying client, each holding that client's real payroll and personal data,
each currently with no backup story and no standardized, repeatable setup
process. A single droplet failure today would mean permanent data loss for
whichever client it belonged to, with no way to recover.

## Target

- **Automated backups**: PocketBase's data (SQLite database + any file
  storage it manages) is backed up on a schedule (daily, minimum) to
  storage independent of the droplet itself (e.g. object storage), with a
  documented, tested restore procedure — not just a backup that's never
  been proven to actually restore.
- **Repeatable deployment**: standing up a *new* client's instance is a
  documented, scripted process (ideally containerized — Docker/Docker
  Compose for the PocketBase + `pb_hooks` side, alongside the existing
  Next.js deployment target) rather than the current by-hand SSH setup,
  so onboarding client #5 doesn't depend on remembering exactly what was
  done for clients #1-4.
- **A tested disaster-recovery runbook**: what to do, step by step, if a
  droplet is lost entirely — restore from the latest backup onto a fresh
  droplet, reconnect `pb_hooks`, verify.

## Repo conventions to follow

- Build on the existing `pb_hooks` deployment pipeline
  (`.github/workflows/deploy-pb-hooks.yml`) rather than replacing it —
  this plan adds backup/restore and containerization around the existing
  droplet model, it doesn't propose a different hosting platform.
- Match `Notes/DEPLOY_PB_HOOKS_SETUP.md`'s existing documentation style
  (clear numbered steps, exact commands, explains *why* each step exists)
  for any new setup/restore docs added under `Notes/`.
- Coordinate with plan 018 — a repeatable deployment script should apply
  the white-label config from that plan as one of its setup steps, not as
  a separate manual task afterward.

## Steps

1. **Confirm current backup state** with whoever manages the droplet
   today (this may already partially exist outside this repo — DigitalOcean
   offers droplet-level snapshots; check whether that's enabled before
   assuming zero backup coverage) and document exactly what does and
   doesn't exist today.
2. **Add a PocketBase data backup script**: a scheduled job (cron on the
   droplet, or a GitHub Actions workflow on a schedule) that exports
   PocketBase's data directory to off-droplet storage, retaining a
   reasonable rolling window (e.g. 30 daily + 12 monthly snapshots).
3. **Write and test a restore procedure** end-to-end against a throwaway
   droplet — restoring a backup that's never been proven to work is not a
   real backup.
4. **Containerize the PocketBase + pb_hooks setup** (Dockerfile +
   docker-compose or equivalent) so a new client's server can be stood up
   from one documented command sequence instead of manual SSH setup.
5. **Write the disaster-recovery runbook** as a new `Notes/
   DISASTER_RECOVERY.md`, covering: total droplet loss, corrupted
   database, and accidental data deletion scenarios, each with exact
   recovery steps.

## Boundaries

- Do NOT migrate off PocketBase or change the hosting provider as part of
  this plan — this is about making the *existing* model safe and
  repeatable, not replacing it.
- Do NOT skip testing the restore procedure — an unverified backup
  strategy provides false confidence, which is arguably worse than no
  backup strategy at all (a team that knows it has no safety net behaves
  more carefully than one that wrongly believes it does).
- Do NOT couple this plan to plan 018's white-labeling work being fully
  complete first — containerized deployment can be built now and simply
  bake in plan 018's config once that lands, rather than blocking on it.

## Verification

- **Manual**: trigger the backup process manually, confirm a valid backup
  artifact is produced off-droplet.
- **Manual**: restore that backup onto a fresh, empty droplet/container and
  confirm the app comes up with the correct data intact.
- **Manual**: stand up a brand-new instance from the containerized setup,
  timing how long it takes and confirming no manual SSH steps were needed
  beyond what the runbook documents.
- **Done when**: backups run on a schedule to off-droplet storage, a
  restore has been proven to work end-to-end at least once, and a new
  client deployment can be stood up from a documented, repeatable process.
