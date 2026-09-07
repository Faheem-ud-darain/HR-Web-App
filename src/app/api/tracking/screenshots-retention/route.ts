import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import {
  adminListScreenshots, adminGetKVByPrefix, adminDeleteRecords, adminDeleteKVByKeys,
  adminListTrackingSettings, adminAddNotification, adminGetKV, adminSetKV,
} from '@/lib/pbAdmin';

export const runtime = 'edge';

// Authenticated replacement for hrActions.checkScreenshotRetention, called
// from admin/page.tsx, hr/page.tsx, and TrackingView.tsx on mount. The old
// version ran entirely client-side against the fully-public hr_screenshots
// collection (see the 2026-09-07 PocketBase audit) — including the actual
// DELETE calls, which (unnoticed) were already silently failing in
// production, since hr_screenshots' Update/Delete rules were admin-only in
// PocketBase while this call never carried real PocketBase admin auth. This
// route does the exact same warn-then-delete logic, just with a real
// admin (superuser) PocketBase connection, so the monthly retention sweep
// actually works.
const RETENTION_DAYS = 30;
const WARNING_GRACE_DAYS = 3;

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session || !['admin', 'hr'].includes(session.role)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  try {
    const state = ((await adminGetKV('hr_screenshot_retention_state_v1'))?.value) || {};
    const now = new Date();
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 3600 * 1000);
    const cutoffISO = cutoff.toISOString();

    async function fetchOldShots() {
      const [realRows, legacyRows] = await Promise.all([
        adminListScreenshots({ untilISO: cutoffISO }),
        adminGetKVByPrefix('screenshot_'),
      ]);
      const fresh = realRows.map((r: any) => ({ id: r.id, employeeEmail: r.employee_email, timestamp: r.captured_at, legacy: false }));
      const legacy = legacyRows
        .map((row) => ({ id: row.value.id, employeeEmail: row.value.employeeEmail, timestamp: row.value.timestamp, legacy: true }))
        .filter((s) => s.timestamp <= cutoffISO);
      return [...fresh, ...legacy];
    }

    if (state.warnedAt && state.pendingDeleteIds?.length) {
      const graceElapsed = (now.getTime() - new Date(state.warnedAt).getTime()) >= WARNING_GRACE_DAYS * 24 * 3600 * 1000;
      if (!graceElapsed) return NextResponse.json({ status: 'grace_period_active' });

      const settings = await adminListTrackingSettings();
      const excluded = new Set(settings.filter((s) => s.excludeFromAutoDelete).map((s) => s.employeeEmail.toLowerCase()));
      const oldShots = await fetchOldShots();
      const stillDue = oldShots.filter((s) => state.pendingDeleteIds!.includes(s.id) && !excluded.has((s.employeeEmail || '').toLowerCase()));

      if (stillDue.length > 0) {
        const realIds = stillDue.filter((s) => !s.legacy).map((s) => s.id);
        const legacyKeys = stillDue.filter((s) => s.legacy).map((s) => `screenshot_${s.id}`);
        await Promise.allSettled([
          realIds.length ? adminDeleteRecords('hr_screenshots', realIds) : Promise.resolve(),
          legacyKeys.length ? adminDeleteKVByKeys(legacyKeys) : Promise.resolve(),
        ]);
        await Promise.all([
          adminAddNotification('all', 'hr', `${stillDue.length} screenshot(s) older than ${RETENTION_DAYS} days were automatically deleted per the monthly retention policy.`),
          adminAddNotification('all', 'admin', `${stillDue.length} screenshot(s) older than ${RETENTION_DAYS} days were automatically deleted per the monthly retention policy.`),
        ]);
      }
      await adminSetKV('hr_screenshot_retention_state_v1', {});
      return NextResponse.json({ status: 'deleted', count: stillDue.length });
    }

    const oldShots = await fetchOldShots();
    if (oldShots.length === 0) return NextResponse.json({ status: 'nothing_due' });

    const settings = await adminListTrackingSettings();
    const excluded = new Set(settings.filter((s) => s.excludeFromAutoDelete).map((s) => s.employeeEmail.toLowerCase()));
    const toDelete = oldShots.filter((s) => !excluded.has((s.employeeEmail || '').toLowerCase()));
    if (toDelete.length === 0) return NextResponse.json({ status: 'nothing_due_after_exclusions' });

    await Promise.all([
      adminAddNotification('all', 'hr', `${toDelete.length} screenshot(s) older than ${RETENTION_DAYS} days are scheduled for automatic deletion in ${WARNING_GRACE_DAYS} days. Export or mark specific employees as excluded before then.`),
      adminAddNotification('all', 'admin', `${toDelete.length} screenshot(s) older than ${RETENTION_DAYS} days are scheduled for automatic deletion in ${WARNING_GRACE_DAYS} days. Export or mark specific employees as excluded before then.`),
    ]);
    await adminSetKV('hr_screenshot_retention_state_v1', { warnedAt: now.toISOString(), pendingDeleteIds: toDelete.map((s) => s.id) });
    return NextResponse.json({ status: 'warned', count: toDelete.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
