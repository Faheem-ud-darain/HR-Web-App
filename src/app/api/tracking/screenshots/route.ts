import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { adminListScreenshots, adminListScreenshotsPage, adminGetFileToken, adminFileUrl } from '@/lib/pbAdmin';
import type { PbRow } from '@/lib/pbTypes';

export const runtime = 'edge';

// Authenticated screenshot listing for ONE employee and a date range.
//
// Paginated: `page` (default 1) returns at most 50 items plus the window's
// totalItems/totalPages. `all=1` returns the whole window (capped) and is for
// the explicit ZIP-export / profile-download flows only.
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

  const wantsAll = searchParams.get('all') === '1';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  try {
    const [result, fileToken] = await Promise.all([
      wantsAll
        ? adminListScreenshots({ employeeEmail, sinceISO, untilISO }).then((rows) => ({ items: rows, page: 1, totalItems: rows.length, totalPages: 1 }))
        : adminListScreenshotsPage({ employeeEmail, sinceISO, untilISO }, page),
      adminGetFileToken(),
    ]);

    const items = result.items.map((r: PbRow) => ({
      id: r.id,
      employeeEmail: r.employee_email,
      timestamp: r.captured_at,
      imageUrl: r.image ? adminFileUrl(r.collectionId, r.id, r.image, fileToken) : '',
      deviceLabel: r.device_label || undefined,
    }));
    return NextResponse.json({ items, page: result.page, totalItems: result.totalItems, totalPages: result.totalPages });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
