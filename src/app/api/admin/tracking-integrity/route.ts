import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { pbAdminFetch } from '@/lib/pbAdmin';
import { buildIntegrityReport } from '@/lib/core/trackingSettings';
import type { PbRow } from '@/lib/pbTypes';

export const runtime = 'edge';

// READ-ONLY tracking health check for HR/Admin: where the profile flag and the tracking
// settings disagree, and who is on shift with nothing being captured. Same logic the scheduled
// daily job will use. GET /api/admin/tracking-integrity
export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session || (session.role !== 'hr' && session.role !== 'admin')) {
    return NextResponse.json({ error: 'HR or Admin only.' }, { status: 403 });
  }
  try {
    const [profiles, settings, shifts, signals] = await Promise.all([
      pbAdminFetch('/api/collections/hr_profiles/records?perPage=500&fields=email,role,region,tracking_enabled'),
      pbAdminFetch('/api/collections/hr_tracking_settings/records?perPage=500&fields=employeeEmail,enabled,intervalMinutes,agentToken'),
      pbAdminFetch(`/api/collections/hr_timesheets/records?perPage=200&fields=employee_id,clock_in&filter=${encodeURIComponent('clock_out = ""')}`),
      pbAdminFetch('/api/collections/hr_tracker_signals/records?perPage=500&fields=email,heartbeat'),
    ]);
    const heartbeats: Record<string, { lastSeenAt?: string; lastCaptureAt?: string | null; captureEnabled?: boolean }> = {};
    for (const r of (signals?.items || []) as PbRow[]) heartbeats[String(r.email || '').toLowerCase()] = r.heartbeat || {};
    const findings = buildIntegrityReport({
      profiles: ((profiles?.items || []) as PbRow[]).map(p => ({ email: p.email, role: p.role, region: p.region, trackingEnabled: !!p.tracking_enabled })),
      settings: ((settings?.items || []) as PbRow[]).map(s => ({ employeeEmail: s.employeeEmail, enabled: !!s.enabled, intervalMinutes: s.intervalMinutes || 15, agentToken: s.agentToken })),
      openShifts: ((shifts?.items || []) as PbRow[]).map(t => ({ employeeEmail: t.employee_id, clockIn: t.clock_in })),
      heartbeats,
    });
    return NextResponse.json({ checkedAt: new Date().toISOString(), count: findings.length, findings });
  } catch (err) {
    console.error('[admin/tracking-integrity] error:', err);
    return NextResponse.json({ error: 'Could not read the data needed for the check.' }, { status: 502 });
  }
}
