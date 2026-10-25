import { NextResponse } from 'next/server';
import type { PbRow } from '@/lib/pbTypes';
import { pbFilter } from '@/lib/pbFilter';
import { pbAdminFetch, adminListTrackingSettings, adminAddNotification, adminFindByField, adminUpsertByField } from '@/lib/pbAdmin';
import {
  retentionPhase, retentionCutoffISO, toPbDate, clearedThroughLabel, nyMonthKey,
} from '@/lib/core/screenshotRetention';

export const runtime = 'edge';

// Monthly screenshot clean-up, called by the Cloudflare cron Worker (workers/cron). Policy and the
// date rules are in lib/core/screenshotRetention.ts (tested): on the 10th, everything captured
// before the start of the current month is deleted; a warning goes out on the 7th; employees marked
// "exclude from auto-delete" are never touched.
//
// POST /api/cron/screenshot-retention?mode=preview|warn|delete
//   Authorization: Bearer <CRON_SECRET>
//   preview  counts what would be deleted; changes nothing
//   warn     (7th–9th) tells HR and Admin once per month what will be deleted on the 10th
//   delete   (10th onward — refused earlier) deletes ONE small batch and reports how many remain.
//
// Why batches: an edge function may make only a limited number of outgoing requests per call and
// each deletion is one request, so a month of screenshots (thousands) cannot go in one call. The
// Worker therefore calls this every few minutes on the 10th–11th until nothing is left; a call
// with nothing due costs three cheap lookups.
const BATCH = 35;
const STATE_KEY = 'screenshot_retention_cron';

interface State { month?: string; deleted?: number; doneNotified?: boolean; warnedMonth?: string }

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET || '';
  if (secret.length < 24) return NextResponse.json({ error: 'The cron secret is not configured.' }, { status: 503 });
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!sameSecret(given, secret)) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });

  const mode = new URL(request.url).searchParams.get('mode') || 'preview';
  if (!['preview', 'warn', 'delete'].includes(mode)) return NextResponse.json({ error: 'Unknown mode.' }, { status: 400 });

  try {
    const now = new Date();
    const phase = retentionPhase(now);
    if (mode === 'delete' && phase !== 'delete') return NextResponse.json({ status: 'too_early', phase });
    if (mode === 'warn' && phase !== 'warn') return NextResponse.json({ status: 'not_warning_time', phase });

    const month = nyMonthKey(now);
    const cutoff = toPbDate(retentionCutoffISO(now));
    const settings = await adminListTrackingSettings();
    const excluded = settings.filter((s: PbRow) => s.excludeFromAutoDelete).map((s: PbRow) => String(s.employeeEmail || '').toLowerCase()).filter(Boolean);

    // "!~" is a case-insensitive NOT-LIKE: if an excluded address matches by accident (substring) the
    // extra rows are KEPT, never deleted — the safe direction.
    const params: Record<string, string> = { cutoff };
    const parts = ['captured_at < {:cutoff}'];
    excluded.forEach((email, i) => { params[`x${i}`] = email; parts.push(`employee_email !~ {:x${i}}`); });
    const filter = pbFilter(parts.join(' && '), params);
    const list = await pbAdminFetch(`/api/collections/hr_screenshots/records?perPage=${mode === 'delete' ? BATCH : 1}&page=1&sort=captured_at&fields=id&filter=${encodeURIComponent(filter)}`);
    const due: number = list?.totalItems ?? (list?.items || []).length;
    const ids: string[] = (list?.items || []).map((r: PbRow) => r.id);

    const state = ((await adminFindByField('hr_system_state', 'key', STATE_KEY))?.data || {}) as State;
    const label = clearedThroughLabel(now);

    if (mode === 'preview') return NextResponse.json({ status: 'preview', due, cutoff, excludedEmployees: excluded.length, phase });

    if (mode === 'warn') {
      if (state.warnedMonth === month || due === 0) return NextResponse.json({ status: due === 0 ? 'nothing_due' : 'already_warned', due });
      const msg = `${due} screenshot(s) from ${label} will be deleted automatically on the 10th. Download anything you still need before then. Employees marked “exclude from auto-delete” are not affected.`;
      await Promise.all([adminAddNotification('all', 'hr', msg, 'shift'), adminAddNotification('all', 'admin', msg)]);
      await adminUpsertByField('hr_system_state', 'key', STATE_KEY, { ...state, warnedMonth: month });
      return NextResponse.json({ status: 'warned', due });
    }

    // mode === 'delete'
    if (ids.length === 0) {
      if ((state.deleted || 0) > 0 && !state.doneNotified && state.month === month) {
        const msg = `Monthly clean-up finished: ${state.deleted} screenshot(s) from ${label} were deleted.`;
        await Promise.all([adminAddNotification('all', 'hr', msg, 'shift'), adminAddNotification('all', 'admin', msg)]);
        await adminUpsertByField('hr_system_state', 'key', STATE_KEY, { ...state, doneNotified: true });
        return NextResponse.json({ status: 'finished', deleted: state.deleted });
      }
      return NextResponse.json({ status: 'nothing_due' });
    }

    const results = await Promise.allSettled(ids.map(id => pbAdminFetch(`/api/collections/hr_screenshots/records/${id}`, { method: 'DELETE' })));
    const deletedNow = results.filter(r => r.status === 'fulfilled').length;
    const base: State = state.month === month ? state : { month, deleted: 0, doneNotified: false, warnedMonth: state.warnedMonth };
    await adminUpsertByField('hr_system_state', 'key', STATE_KEY, { ...base, month, deleted: (base.deleted || 0) + deletedNow, doneNotified: false });
    return NextResponse.json({ status: 'deleted', deleted: deletedNow, failed: ids.length - deletedNow, remaining: Math.max(0, due - deletedNow) });
  } catch (err) {
    console.error('[cron/screenshot-retention] error:', err);
    return NextResponse.json({ error: 'The clean-up could not run. Nothing was changed by this call.' }, { status: 500 });
  }
}
