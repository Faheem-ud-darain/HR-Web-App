import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { pbAdminFetch, adminFindProfileByEmail } from '@/lib/pbAdmin';
import { mapProfileRecord, scopeProfileForViewer } from '@/lib/core/profiles';
import type { PbRow } from '@/lib/pbTypes';

export const runtime = 'edge';

// The caller's OWN profile, and nothing else — the same record (and the same fields) that
// /api/roster returns for them, but built from two small lookups instead of the whole company.
// The dashboard needs this to start up: it used to wait for the full roster (every profile plus
// every overlay row) before it rendered anything and before any of its own data requests began,
// which on a slow link is seconds of looking at a spinner.
const PB_URL = process.env.NEXT_PUBLIC_PB_URL || 'https://pb.delcargo.us';

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const record = await adminFindProfileByEmail(session.email);
    if (!record) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    const extras = await pbAdminFetch(`/api/collections/hr_profile_extras/records?perPage=1&filter=${encodeURIComponent(`profile_id = "${String(record.id).replace(/[^A-Za-z0-9]/g, '')}"`)}`);
    const pictureUrl = record.profile_picture_file
      ? `${PB_URL}/api/files/${record.collectionId}/${record.id}/${record.profile_picture_file}`
      : undefined;
    const extraData: PbRow = extras?.items?.[0]?.data || {};
    const profile = scopeProfileForViewer(mapProfileRecord(record, extraData, pictureUrl), { email: session.email, role: session.role });
    return NextResponse.json({ profile });
  } catch (err) {
    console.error('[me] failed:', err);
    return NextResponse.json({ error: 'Could not load your profile.' }, { status: 500 });
  }
}
