import { NextResponse } from 'next/server';
import { adminAddNotification, adminFindByField, adminUpsertByField } from '@/lib/pbAdmin';
import { planGapAlerts, type GapAlertState } from '@/lib/core/trackingSettings';
import { loadTrackingHealth } from '@/lib/trackingIntegrity';

export const runtime = 'edge';

// Tells HR and Admin when someone is on shift with nothing being captured ("tracking is OFF", or no screenshot for a
// long while), called every 20 minutes by the Cloudflare cron Worker (workers/cron). Each person is announced at most once
// every two hours (planGapAlerts, tested). It only notifies: nothing is changed or closed.
//
// POST /api/cron/tracking-integrity
//   Authorization: Bearer <CRON_SECRET>
const STATE_KEY = 'tracking_gap_alerts';

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET || '';
  if (secret.length < 24) return NextResponse.json({ error: 'The cron secret is not configured.' }, { status: 503 });
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!sameSecret(given, secret)) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });

  try {
    const { findings, diagnoses } = await loadTrackingHealth();
    const state = ((await adminFindByField('hr_system_state', 'key', STATE_KEY))?.data || {}) as GapAlertState;
    const { send, next } = planGapAlerts(findings, state, Date.now());
    const byEmail = new Map(diagnoses.map(d => [d.email, d]));
    for (const f of send) {
      // The diagnosis says what is wrong AND what to do about it; the raw finding is the fallback.
      const d = byEmail.get(f.email.toLowerCase());
      const message = d && d.action ? `${f.email}: ${d.cause} ${d.action}` : `${f.email}: ${d?.cause || f.detail}`;
      await Promise.all([adminAddNotification('all', 'hr', message, 'shift'), adminAddNotification('all', 'admin', message)]);
    }
    // Saved after sending: if saving fails the worst case is one repeated alert, never a missed one.
    if (JSON.stringify(next) !== JSON.stringify(state)) await adminUpsertByField('hr_system_state', 'key', STATE_KEY, next);
    return NextResponse.json({ status: 'ok', flagged: findings.length, alerted: send.length });
  } catch (err) {
    console.error('[cron/tracking-integrity] error:', err);
    return NextResponse.json({ error: 'The tracking check could not run.' }, { status: 502 });
  }
}
