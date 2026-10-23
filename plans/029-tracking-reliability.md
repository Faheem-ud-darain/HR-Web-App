# 029 — Tracking reliability (settings overwrite, shift closing, capture gaps)

- **Status**: P1 and P2 IMPLEMENTED on branch `claude/codebase-structure-review-0e254f` (not deployed); items marked TODO remain
- **Origin**: Zara, 22 Oct 2026 — 7h 38m of shifts but only 15 screenshots. Her tracking setting was overwritten to OFF at 18:01 UTC; the tracker stopped capturing, and the server hook then ended her shifts about hourly as "app closed".

## Root causes found

1. **Settings overwrite.** `updateTrackingSettings` read the row with a function that returns `[]` on any database error; "no row" then meant first-time defaults (tracking OFF + a new setup code), written over the real row. Affected olivia (Aug), alex, zara, sofia (Oct).
2. **Two flags.** `hr_tracking_settings.enabled` (what the tracker obeys) and `hr_profiles.tracking_enabled` (what the dashboard menu shows) were written separately (e.g. by the Admin → Reports "Enable Workstation Monitoring" checkbox) and drifted apart.
3. **The shift-closing hook read retired storage.** `pb_hooks/auto_close_stale_shifts.pb.js` looked for the portal-tab heartbeat and tracker heartbeat in `hr_delcargo_store` (KV rows last written in September). Every untracked manual shift therefore looked abandoned and was closed ~50 minutes after it started; tracked employees were protected only by the tracking setting being ON.
4. **No alert** when someone was on shift with nothing being captured.

## Done (P1)

- **Server-only settings writes**: `POST /api/tracking/settings` (`src/app/api/tracking/settings/route.ts`) is the only writer. It reads first (failure = 502, nothing written), writes only the fields sent, keeps `hr_profiles.tracking_enabled` in step, and logs every change. Permissions in `src/lib/core/trackingSettings.ts` (`planTrackingSettingsChange`): HR/Admin anything; an employee only their own setup code.
- **Change log**: collection `hr_tracking_settings_log` (admin-only), created by the new schema-migration action `ensureTrackingSettingsLog`. **TODO: run it once** (`{ action: 'ensureTrackingSettingsLog', dryRun: false }`); until then logging is skipped silently and nothing else is affected.
- **One source of truth**: `isTrackingOn()` — the settings row wins, the profile flag is only a fallback when no row exists. Used by the sidebar, the employee dashboard and the abandoned-shift check. The Admin Reports checkbox and the Tracking toggle now go through the route.
- **Failed reads are errors**: `pbListStrict`; `getTrackingSettingsFor` / `getAllTrackingSettings` use it. The abandoned-shift check never closes a shift if settings can't be read, and treats a shift as tracked if either flag says so.
- **Hook fixed** (`pb_hooks/auto_close_stale_shifts.pb.js`): reads `hr_tracker_signals.heartbeat` and `hr_shift_tab_heartbeats.last_seen_at`; an unreadable heartbeat skips the shift instead of closing it; Pass 2 also skips anyone whose profile flag is on. **TODO: takes effect only when the hook is redeployed to the droplet.**

## Done (P2)

- **Capture-gap alert** (`getCaptureGap`, shown in the Tracking page status badge): "On shift, tracking OFF" and "No screenshots for N min". Stays quiet for the Chromebook extension, which doesn't report capture times.
- **Tracker app message** (v25, unreleased): "Tracking is OFF during your shift… tell HR now".
- **Clear wording**: "…the DelCargo portal (browser tab or mobile app) was closed or stopped responding…" replaces "the app was closed".
- **Integrity check**: `GET /api/admin/tracking-integrity` (HR/Admin, read-only) lists flag mismatches, missing settings rows, and on-shift gaps. First live run found: sofia (no screenshots 92 min), rahim and luna (profile flag off, settings on). `grace` (Chromebook extension) is correctly not flagged.
- **Tests**: failing-read behaviour, permission rules, `isTrackingOn`, capture gap, integrity report.

## Still to do

1. **Deploy**: merge, redeploy the app (route + client) and the PocketBase hook; run `ensureTrackingSettingsLog` once.
2. **Scheduled job on Cloudflare** (see plan 028, Phase 3b): the integrity check and shift closing every 15–30 minutes with a Worker cron calling `/api/cron/*`; notify HR when a gap is found.
3. **Lock the public PocketBase rules** for `hr_tracking_settings` (write = admin only) once the route is live — until then a browser could still write the table directly.
4. **Data repair**: Luna and Rahim's profile flags (shown as mismatch) are fixed by toggling tracking off/on once on the Tracking page, which now syncs both flags.
