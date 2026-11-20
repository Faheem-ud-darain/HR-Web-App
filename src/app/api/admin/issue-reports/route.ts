import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { adminListAll, pbAdminFetch } from '@/lib/pbAdmin';
import { pbFilter } from '@/lib/pbFilter';
import type { PbRow } from '@/lib/pbTypes';

export const runtime = 'edge';

// HR/Admin's view of the problem reports that employees' devices send (hr_issue_reports). Reports are written straight to the
// database by the browser (so they still arrive when this site is unreachable); reading them is limited to HR and Admin here, because
// they hold emails, devices and page addresses. Nobody else can list them: the collection's list/view rules are admin-only.
const STATUSES = ['new', 'seen', 'resolved'];
const isPbId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]{15}$/.test(v);

async function requireStaff(request: Request) {
  const session = await requireSession(request);
  if (!session) return { error: NextResponse.json({ error: 'Not authenticated.' }, { status: 401 }) };
  if (session.role !== 'hr' && session.role !== 'admin') return { error: NextResponse.json({ error: 'Not allowed.' }, { status: 403 }) };
  return { session };
}

export async function GET(request: Request) {
  const { error } = await requireStaff(request);
  if (error) return error;
  const params = new URL(request.url).searchParams;
  const email = (params.get('email') || '').trim();
  const days = Math.min(Math.max(Number(params.get('days')) || 30, 1), 90);
  const since = new Date(Date.now() - days * 86400000).toISOString().replace('T', ' ');
  const filters = [pbFilter('created >= {:since}', { since })];
  if (email) filters.push(pbFilter('email ~ {:email}', { email }));
  try {
    // Every page (up to 5,000 reports): an older open report must never be hidden behind a newer page of resolved ones.
    const items = await adminListAll('hr_issue_reports', `sort=-created&filter=${encodeURIComponent(filters.join(' && '))}`);
    return NextResponse.json({ items: items as PbRow[] });
  } catch (err) {
    console.error('[issue-reports] list error:', err);
    return NextResponse.json({ error: 'Could not load problem reports.' }, { status: 500 });
  }
}

// Mark one report, or every report of one problem (same fingerprint), as seen/resolved, with an optional note for colleagues.
export async function PATCH(request: Request) {
  const { error } = await requireStaff(request);
  if (error) return error;
  const body = await request.json().catch(() => null) as { ids?: unknown; status?: unknown; adminNote?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter(isPbId).slice(0, 300) : [];
  if (!body || ids.length === 0 || !STATUSES.includes(String(body.status))) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const patch: PbRow = { status: body.status };
  if (typeof body.adminNote === 'string') patch.admin_note = body.adminNote.slice(0, 1000);
  try {
    const results = await Promise.allSettled(ids.map(id => pbAdminFetch(`/api/collections/hr_issue_reports/records/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })));
    const failed = results.filter(r => r.status === 'rejected').length;
    return failed ? NextResponse.json({ error: `${failed} of ${ids.length} reports could not be updated.` }, { status: 502 }) : NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[issue-reports] update error:', err);
    return NextResponse.json({ error: 'Could not update the reports.' }, { status: 500 });
  }
}

// Delete reports once they are dealt with (reports hold personal details, so they should not pile up).
export async function DELETE(request: Request) {
  const { error } = await requireStaff(request);
  if (error) return error;
  const body = await request.json().catch(() => null) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter(isPbId).slice(0, 300) : [];
  if (ids.length === 0) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  try {
    const results = await Promise.allSettled(ids.map(id => pbAdminFetch(`/api/collections/hr_issue_reports/records/${id}`, { method: 'DELETE' })));
    // A report that is already gone (404) counts as deleted; anything else is a real failure to report.
    const failed = results.filter(r => r.status === 'rejected' && !/ 404 /.test(String((r as PromiseRejectedResult).reason?.message))).length;
    return failed ? NextResponse.json({ error: `${failed} of ${ids.length} reports could not be deleted.` }, { status: 502 }) : NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[issue-reports] delete error:', err);
    return NextResponse.json({ error: 'Could not delete the reports.' }, { status: 500 });
  }
}
