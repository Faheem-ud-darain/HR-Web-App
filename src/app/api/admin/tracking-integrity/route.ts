import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { summariseDiagnoses } from '@/lib/core/trackerDiagnosis';
import { loadTrackingHealth } from '@/lib/trackingIntegrity';

export const runtime = 'edge';

// READ-ONLY tracking health check, HR and Admin only (it feeds the Tracker Health page). `findings`: where the profile flag and the tracking settings disagree, and who
// is on shift with nothing being captured. `fleet`: every tracker's state with its cause and the next step, worst first, so
// one request answers "which trackers need attention and what do I do". `trackers`: all of them, for the page's table. The scheduled job (/api/cron/tracking-integrity)
// runs the same check and alerts HR. GET /api/admin/tracking-integrity
export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session || (session.role !== 'hr' && session.role !== 'admin')) {
    return NextResponse.json({ error: 'HR or Admin only.' }, { status: 403 });
  }
  try {
    const { findings, diagnoses } = await loadTrackingHealth();
    return NextResponse.json({ checkedAt: new Date().toISOString(), count: findings.length, findings, fleet: summariseDiagnoses(diagnoses), trackers: diagnoses });
  } catch (err) {
    console.error('[admin/tracking-integrity] error:', err);
    return NextResponse.json({ error: 'Could not read the data needed for the check.' }, { status: 502 });
  }
}
