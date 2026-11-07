import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { pbAdminFetch } from '@/lib/pbAdmin';
import { getClientIp } from '@/lib/rateLimit';
import { buildAuditEntry } from '@/lib/core/communicationAudit';

export const runtime = 'edge';

// POST { kind, refId, messageId?, claimedSender?, deviceId? }: stamps one communication into hr_communication_audit.
// The signed-in account comes from the verified session; the address, country and device come from the request itself (Cloudflare
// sets them), never from the body. Append-only: the table's rules are null, so only this route (admin token) can add to it and
// nothing in the app can change or delete an entry. The browser calls this AFTER a message is saved and ignores any failure, so a
// problem here can never stop someone sending a message. Until the table exists (schema-migration: ensureCommunicationAudit) it answers
// { configured: false } and stores nothing.
export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const built = buildAuditEntry(body, {
    email: session.email, role: session.role, ip: getClientIp(request), country: request.headers.get('cf-ipcountry'),
    userAgent: request.headers.get('user-agent') || '', now: Date.now(),
  });
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
  try {
    await pbAdminFetch('/api/collections/hr_communication_audit/records', { method: 'POST', body: JSON.stringify(built.entry) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (/\b404\b/.test(String((err as Error)?.message || ''))) return NextResponse.json({ ok: false, configured: false });
    console.error('[audit/communication] error:', err);
    return NextResponse.json({ error: 'Could not record this.' }, { status: 502 });
  }
}
