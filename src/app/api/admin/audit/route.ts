import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { pbAdminFetch } from '@/lib/pbAdmin';
import { pbFilter } from '@/lib/pbFilter';
import { isStaffRole } from '@/lib/core/profiles';
import { COMMUNICATION_KINDS, isNameMismatch, type AuditEntry } from '@/lib/core/communicationAudit';
import type { PbRow } from '@/lib/pbTypes';

export const runtime = 'edge';

// GET ?kind=&who=&ref=&limit= : the communication trail, newest first. HR and Admin only. Read-only on purpose: there is no way to
// change or delete an entry through the app (the table's own rules are null and this file exports no write method).
export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session || !isStaffRole(session.role)) return NextResponse.json({ error: 'HR or Admin only.' }, { status: 403 });
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') || '';
  const who = (url.searchParams.get('who') || '').trim().slice(0, 80);
  const ref = (url.searchParams.get('ref') || '').trim().slice(0, 80);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 200, 1), 500);

  const parts: string[] = [];
  const params: Record<string, string> = {};
  if (COMMUNICATION_KINDS.includes(kind as never)) { parts.push('kind = {:kind}'); params.kind = kind; }
  if (who) { parts.push('(actor ~ {:who} || claimed_sender ~ {:who} || ip ~ {:who})'); params.who = who; }
  if (ref) { parts.push('ref_id = {:ref}'); params.ref = ref; }
  try {
    const filter = parts.length ? `&filter=${encodeURIComponent(pbFilter(parts.join(' && '), params))}` : '';
    const list = await pbAdminFetch(`/api/collections/hr_communication_audit/records?perPage=${limit}&sort=-created${filter}`);
    const items = ((list?.items || []) as PbRow[]).map(r => ({
      id: r.id as string, kind: r.kind as AuditEntry['kind'], refId: r.ref_id as string, messageId: r.message_id as string, actor: r.actor as string,
      actorRole: r.actor_role as string, claimedSender: r.claimed_sender as string, ip: r.ip as string, country: r.country as string,
      device: r.device as string, occurredAt: r.occurred_at as string, nameMismatch: isNameMismatch({ actor: r.actor, claimed_sender: r.claimed_sender }),
    }));
    return NextResponse.json({ configured: true, items });
  } catch (err) {
    if (/\b404\b/.test(String((err as Error)?.message || ''))) return NextResponse.json({ configured: false, items: [] });
    console.error('[admin/audit GET] error:', err);
    return NextResponse.json({ error: 'Could not read the trail.' }, { status: 502 });
  }
}
