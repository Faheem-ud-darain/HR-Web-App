import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { adminFindProfileByEmail, adminListScreenshots, adminGetKVByPrefix, adminGetFileToken, adminFileUrl } from '@/lib/pbAdmin';

export const runtime = 'edge';

// Authenticated replacement for hrActions.getScreenshots' single real call
// site (TrackingView.tsx's screenshot viewer/export — always scoped to one
// employee + a date range). Before this route existed, hr_screenshots had
// to keep its List/View rules fully public for the Tracking page to work
// at all, since nothing in this app's browser code ever authenticates with
// PocketBase's own auth system (see the 2026-09-07 PocketBase audit notes)
// — meaning anyone on the internet could pull every employee's screenshots
// directly from PocketBase's REST API, no login required. This route
// checks the caller's real session JWT and role server-side, then uses a
// PocketBase admin (superuser) connection to fetch only what that caller
// is allowed to see.
//
// Access: admin/hr can view anyone; team_lead only their own team's
// members (mirrors TrackingView.tsx's existing `employees` filter); plain
// employees get nothing (the Tracking page never lets them reach this
// screen in the first place, so no self-view case to support here).
export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  if (!['admin', 'hr', 'team_lead'].includes(session.role)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const employeeEmail = searchParams.get('employeeEmail') || undefined;
  const sinceISO = searchParams.get('sinceISO') || undefined;
  const untilISO = searchParams.get('untilISO') || undefined;

  if (!employeeEmail) {
    return NextResponse.json({ error: 'employeeEmail is required.' }, { status: 400 });
  }

  if (session.role === 'team_lead') {
    const [viewer, target] = await Promise.all([
      adminFindProfileByEmail(session.email),
      adminFindProfileByEmail(employeeEmail),
    ]);
    const leadTeams: string[] = viewer?.leadTeams || [];
    const targetTeams: string[] = target?.teams || [];
    const allowed = !!target && targetTeams.some((t) => leadTeams.includes(t));
    if (!allowed) {
      return NextResponse.json({ error: 'Not authorized for this employee.' }, { status: 403 });
    }
  }

  try {
    const [realRows, legacyRows, fileToken] = await Promise.all([
      adminListScreenshots({ employeeEmail, sinceISO, untilISO }),
      adminGetKVByPrefix('screenshot_'),
      adminGetFileToken(),
    ]);

    const fresh = realRows.map((r: any) => ({
      id: r.id,
      employeeEmail: r.employee_email,
      timestamp: r.captured_at,
      imageUrl: r.image ? adminFileUrl(r.collectionId, r.id, r.image, fileToken) : '',
      deviceLabel: r.device_label || undefined,
    }));

    const wanted = employeeEmail.toLowerCase();
    let legacyShots = legacyRows
      .map((row) => ({
        id: row.value.id,
        employeeEmail: row.value.employeeEmail,
        timestamp: row.value.timestamp,
        imageUrl: row.value.imageData,
        legacy: true,
      }))
      .filter((s) => (s.employeeEmail || '').toLowerCase() === wanted);
    if (sinceISO) legacyShots = legacyShots.filter((s) => s.timestamp >= sinceISO);
    if (untilISO) legacyShots = legacyShots.filter((s) => s.timestamp <= untilISO);

    const combined = [...fresh, ...legacyShots].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return NextResponse.json({ items: combined });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
