#!/usr/bin/env node
// Runs `next build` for a native (Capacitor) build, working around a real
// incompatibility: `output: 'export'` (set in next.config.ts whenever
// CAPACITOR_BUILD=true) does not allow ANY dynamic API route to exist
// anywhere under src/app/api — and src/app/api/pb/api/realtime/route.ts
// (`export const dynamic = 'force-dynamic'`) has to be dynamic, since it's
// a streaming SSE proxy for PocketBase's realtime endpoint, needed for the
// *web* deployment only.
//
// The native app never calls this route at all — see src/lib/pocketbase.ts,
// which points native builds straight at https://pb.delcargo.us and only
// uses the local '/api/pb' proxy on the web. So this file is genuinely dead
// weight for a Capacitor build, but its mere presence makes `next build`
// hard-fail with:
//   "export const dynamic = 'force-dynamic' on page
//   '/api/pb/api/realtime' cannot be used with 'output: export'"
//
// Critically, `npx cap sync` does NOT check whether the `next build` that's
// supposed to run before it actually succeeded — it just re-syncs whatever
// is already sitting in out/, silently. That means every native rebuild
// since this route file was added may have been re-syncing a stale out/
// folder from before it existed, even though the terminal printed a real
// build failure right above the (unrelated, always-"successful") cap sync
// output.
//
// Fix: temporarily move src/app/api out of the tree, run the real build,
// then restore it — success or failure, via try/finally.

import { existsSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const apiDir = path.join(process.cwd(), 'src', 'app', 'api');
const apiBackupDir = path.join(process.cwd(), 'src', 'app', '__api_backup_for_capacitor_build__');

const moved = existsSync(apiDir);
if (moved) {
  renameSync(apiDir, apiBackupDir);
  console.log('[build-for-capacitor] Temporarily moved src/app/api aside (incompatible with output: export).');
} else {
  console.log('[build-for-capacitor] src/app/api not found — nothing to move (already excluded?).');
}

let exitCode = 1;
try {
  const result = spawnSync('npx', ['next', 'build'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, CAPACITOR_BUILD: 'true' },
  });
  exitCode = result.status ?? 1;
} finally {
  if (moved) {
    renameSync(apiBackupDir, apiDir);
    console.log('[build-for-capacitor] Restored src/app/api.');
  }
}

if (exitCode !== 0) {
  console.error('[build-for-capacitor] next build FAILED (exit code ' + exitCode + '). Do not run cap sync on top of this — out/ was not regenerated.');
}

process.exit(exitCode);
