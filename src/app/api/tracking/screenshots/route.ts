import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { adminListScreenshots, adminGetFileToken, adminFileUrl } from '@/lib/pbAdmin';
import type { PbRow } from '@/lib/pbTypes';

export const runtime = 'edge';

const SCREENSHOT_THUMB = '300x180';

// Authenticated screenshot listing for ONE employee and a date range.
//
// Access: HR and Admin only. Nobody else — not team leads, and not the
// employee themselves — may list or download screenshots. hr_screenshots'
// List/View rules and its protected `image` file field are locked in
// PocketBase, so this route (which mints the short-lived file token only
// after the session role check below) is the single way to reach them.
export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  if (!['admin', 'hr'].includes(session.role)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const employeeEmail = searchParams.get('employeeEmail') || undefined;
  const sinceISO = searchParams.get('sinceISO') || undefined;
  const untilISO = searchParams.get('untilISO') || undefined;

  if (!employeeEmail) {
    return NextResponse.json({ error: 'employeeEmail is required.' }, { status: 400 });
  }

  try {
    const [rows, fileToken] = await Promise.all([
      adminListScreenshots({ employeeEmail, sinceISO, untilISO }),
      adminGetFileToken(),
    ]);

    const items = rows.map((r: PbRow) => ({
      id: r.id,
      employeeEmail: r.employee_email,
      timestamp: r.captured_at,
      imageUrl: r.image ? adminFileUrl(r.collectionId, r.id, r.image, fileToken) : '',
      thumbUrl: r.image ? adminFileUrl(r.collectionId, r.id, r.image, fileToken, SCREENSHOT_THUMB) : '',
      deviceLabel: r.device_label || undefined,
    }));
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
