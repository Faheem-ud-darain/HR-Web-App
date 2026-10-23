import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { pbAdminFetch, adminFindProfileByEmail, adminUpdateProfile } from '@/lib/pbAdmin';
import { pbFilter } from '@/lib/pbFilter';
import { planTrackingSettingsChange, type TrackingSettingsRow } from '@/lib/core/trackingSettings';
import type { PbRow } from '@/lib/pbTypes';

export const runtime = 'edge';

// The ONLY writer of hr_tracking_settings. The browser used to write it directly, and a failed
// read inside that code could overwrite a real row with first-time defaults (tracking off + a
// new setup code). Here the read must succeed before anything is written (a PocketBase error
// becomes a 502, never "no row"), an existing row only receives the fields that were sent, and
// who may change what is decided by planTrackingSettingsChange (core/trackingSettings.ts).
//
// POST { email, updates: { enabled?, intervalMinutes?, excludeFromAutoDelete?, agentToken? } }
//  - HR/Admin: any employee, any of those fields.
//  - Employee / team lead: only their own row, and only agentToken (or {} to make sure a row exists).
// Every change is written to hr_tracking_settings_log (best-effort, see schema-migration's
// ensureTrackingSettingsLog) and hr_profiles.tracking_enabled is kept in step with `enabled`.

function toRow(r: PbRow): TrackingSettingsRow {
  return {
    id: r.id, employeeEmail: r.employeeEmail, enabled: !!r.enabled, intervalMinutes: r.intervalMinutes,
    excludeFromAutoDelete: !!r.excludeFromAutoDelete, agentToken: r.agentToken,
  };
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  let body: PbRow;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  try {
    // Case-insensitive lookup ("~" narrows, the exact check confirms). A failure THROWS (-> 502).
    let existing: TrackingSettingsRow | null = null;
    if (email) {
      const list = await pbAdminFetch(`/api/collections/hr_tracking_settings/records?perPage=20&filter=${encodeURIComponent(pbFilter('employeeEmail ~ {:email}', { email }))}`);
      const found = (list?.items || []).find((r: PbRow) => String(r.employeeEmail || '').toLowerCase() === email);
      existing = found ? toRow(found) : null;
    }

    const plan = planTrackingSettingsChange({ actor: { email: session.email, role: session.role }, targetEmail: email, updates: body.updates, existing });
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });

    let row = existing;
    if (plan.mode === 'create') {
      row = toRow(await pbAdminFetch('/api/collections/hr_tracking_settings/records', { method: 'POST', body: JSON.stringify(plan.write) }));
    } else if (plan.mode === 'update' && existing?.id) {
      row = toRow(await pbAdminFetch(`/api/collections/hr_tracking_settings/records/${existing.id}`, { method: 'PATCH', body: JSON.stringify(plan.write) }));
    }

    if (plan.mode !== 'none') {
      // Keep the profile flag (what the dashboard menu reads) in step with `enabled`.
      if ('enabled' in plan.changes) {
        try {
          const profile = await adminFindProfileByEmail(email);
          if (profile && !!profile.tracking_enabled !== !!row?.enabled) await adminUpdateProfile(profile.id, { tracking_enabled: !!row?.enabled });
        } catch (err) { console.error('[tracking/settings] profile flag sync failed:', err); }
      }
      try {
        await pbAdminFetch('/api/collections/hr_tracking_settings_log/records', {
          method: 'POST',
          body: JSON.stringify({ employeeEmail: email, actor: session.email, actorRole: session.role, action: plan.mode, changes: plan.changes }),
        });
      } catch { /* log collection may not exist yet, or a transient error — never block the change */ }
    }

    return NextResponse.json({ settings: row });
  } catch (err) {
    console.error('[tracking/settings] error:', err);
    return NextResponse.json({ error: 'Could not reach the database. Nothing was changed.' }, { status: 502 });
  }
}
