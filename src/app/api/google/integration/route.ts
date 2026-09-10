import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { adminGetKV, adminSetKV, adminDeleteKVByKeys } from '@/lib/pbAdmin';

export const runtime = 'edge';

// Authenticated replacement for GoogleIntegrationCard.tsx's old direct
// hrActions.getKV/setKV/deleteKV calls against the fully-public
// hr_delcargo_store collection. Two problems that fixed, not just one:
//
// 1. hr_delcargo_store's rules are still public (see plan 012's
//    hr_delcargo_store investigation notes) — anyone could already read
//    every employee's Google OAuth access/refresh tokens by listing that
//    collection directly, no login required.
// 2. Even for the LEGITIMATE caller, the old client code fetched the
//    entire KV value — including the raw accessToken/refreshToken — into
//    browser state (see GoogleIntegrationCard's `googleData`), just to
//    display a connection badge and three toggle switches. Nothing in
//    this app actually needs those tokens client-side today (Calendar/
//    Meet integration is still just public meet.google.com/calendar
//    template links — see ScheduleMeetModal.tsx — not an authenticated
//    Google API call), so there's no reason to ever ship them to the
//    browser. This route only ever returns the safe subset.
//
// Always scoped to the CALLER's own row (session.email) — never a
// client-supplied email — same "self" pattern as /api/payroll/me.

function storeKeyFor(email: string) {
  return `google_integration_${email.toLowerCase()}`;
}

// Fields safe to send to the browser. Deliberately excludes `tokens`
// (accessToken/refreshToken/expiresAt) entirely.
function toSafeShape(value: any) {
  if (!value) return null;
  return {
    connectedEmail: value.connectedEmail,
    connectedAt: value.connectedAt,
    syncCalendar: value.syncCalendar !== false,
    useFor2FA: value.useFor2FA !== false,
    useForPasswordReset: value.useForPasswordReset !== false,
  };
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    const row = await adminGetKV(storeKeyFor(session.email));
    return NextResponse.json({ data: toSafeShape(row?.value) });
  } catch (err: any) {
    console.error('[google/integration GET] error:', err);
    return NextResponse.json({ error: 'Could not load Google integration status.' }, { status: 500 });
  }
}

// body: { syncCalendar?: boolean; useFor2FA?: boolean; useForPasswordReset?: boolean }
// Merges into the existing overlay (preserving tokens/connectedEmail/
// connectedAt server-side) rather than replacing it wholesale, so a
// toggle flip can never accidentally drop the stored tokens.
export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const key = storeKeyFor(session.email);
  try {
    const existing = await adminGetKV(key);
    if (!existing?.value) {
      return NextResponse.json({ error: 'No connected Google account to update.' }, { status: 404 });
    }
    const next = { ...existing.value };
    if (typeof body.syncCalendar === 'boolean') next.syncCalendar = body.syncCalendar;
    if (typeof body.useFor2FA === 'boolean') next.useFor2FA = body.useFor2FA;
    if (typeof body.useForPasswordReset === 'boolean') next.useForPasswordReset = body.useForPasswordReset;
    await adminSetKV(key, next);
    return NextResponse.json({ data: toSafeShape(next) });
  } catch (err: any) {
    console.error('[google/integration POST] error:', err);
    return NextResponse.json({ error: 'Could not update Google integration settings.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  try {
    await adminDeleteKVByKeys([storeKeyFor(session.email)]);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[google/integration DELETE] error:', err);
    return NextResponse.json({ error: 'Could not disconnect Google account.' }, { status: 500 });
  }
}
