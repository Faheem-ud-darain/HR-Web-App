#!/usr/bin/env node
// Runs `next build` for a native (Capacitor) build, working around a real
// incompatibility: `output: 'export'` (set in next.config.ts whenever
// CAPACITOR_BUILD=true) does not allow ANY dynamic API route to exist
// anywhere under src/app/api.
//
// Automatically syncs package.json version -> android/app/build.gradle
// (versionName & versionCode) so version numbers never get out of sync.

import { existsSync, renameSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// ── 0. Auto-sync package.json version -> native config files ─────────────────
function syncVersionToNative() {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (!existsSync(pkgPath)) return;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const version = (pkg.version || '1.0.0').trim();

    // Parse semver into numeric code (e.g., "1.6.0" -> 10600, "1.6" -> 10600)
    const parts = version.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const major = parts[0] || 1;
    const minor = parts[1] || 0;
    const patch = parts[2] || 0;
    const versionCode = major * 10000 + minor * 100 + patch;

    // 1. Android build.gradle
    const gradlePath = path.join(process.cwd(), 'android', 'app', 'build.gradle');
    if (existsSync(gradlePath)) {
      let content = readFileSync(gradlePath, 'utf8');
      content = content.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
      content = content.replace(/versionName\s+["'].*?["']/, `versionName "${version}"`);
      writeFileSync(gradlePath, content, 'utf8');
      console.log(`[version-sync] Synced package.json v${version} -> Android build.gradle (versionName "${version}", versionCode ${versionCode})`);
    }
  } catch (err) {
    console.error('[version-sync] Warning: Could not auto-sync version to native project files:', err);
  }
}

syncVersionToNative();

const apiDir = path.join(process.cwd(), 'src', 'app', 'api');
const apiBackupDir = path.join(process.cwd(), 'src', 'app', '__api_backup_for_capacitor_build__');
const nextCacheDir = path.join(process.cwd(), '.next');

if (existsSync(nextCacheDir)) {
  rmSync(nextCacheDir, { recursive: true, force: true });
  console.log('[build-for-capacitor] Cleared .next cache (avoids stale references to the moved api/ folder).');
}

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
