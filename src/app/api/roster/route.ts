import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { pbAdminFetch, adminListAllProfiles } from '@/lib/pbAdmin';
import { mapProfileRecord, scopeProfileForViewer } from '@/lib/core/profiles';
import type { PbRow } from '@/lib/pbTypes';

export const runtime = 'edge';

// The company roster, built on the server and trimmed to what the CALLER may
// see (see src/lib/core/profiles.ts): HR/Admin get every field except password
// hashes, everyone else gets their own record in full plus only the public
// directory fields of colleagues. Replaces the browser reading hr_profiles +
// hr_profile_extras straight from PocketBase, which handed every employee
// everyone's salary, bank details and password hash.
const PB_URL = process.env.NEXT_PUBLIC_PB_URL || 'https://pb.delcargo.us';

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const [records, extraRows] = await Promise.all([
      adminListAllProfiles(),
      pbAdminFetch('/api/collections/hr_profile_extras/records?perPage=500').then(r => r?.items || []),
    ]);
    const extrasById: PbRow = {};
    extraRows.forEach((row: PbRow) => { extrasById[row.profile_id] = row.data || {}; });

    const viewer = { email: session.email, role: session.role };
    const profiles = records.map((r: PbRow) => {
      const pictureUrl = r.profile_picture_file
        ? `${PB_URL}/api/files/${r.collectionId}/${r.id}/${r.profile_picture_file}`
        : undefined;
      return scopeProfileForViewer(mapProfileRecord(r, extrasById[r.id] || {}, pictureUrl), viewer);
    });
    return NextResponse.json({ profiles });
  } catch (err) {
    console.error('[roster] failed:', err);
    return NextResponse.json({ error: 'Could not load the roster.' }, { status: 500 });
  }
}
