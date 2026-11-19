import { NextResponse } from 'next/server';
import { requireSession, signGoogleLinkState } from '@/lib/serverAuth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// POST: the signed-in person asks for the `state` to put on their Google account-link request (see signGoogleLinkState in serverAuth.ts).
// It names the CALLER's own email, never one supplied by the client.
export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  try {
    return NextResponse.json({ state: await signGoogleLinkState(session.email) });
  } catch (err) {
    console.error('[google/link-state] error:', err);
    return NextResponse.json({ error: 'Could not start linking your Google account.' }, { status: 500 });
  }
}
