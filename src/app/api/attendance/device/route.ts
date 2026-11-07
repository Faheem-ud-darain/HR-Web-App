import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { adminFindByField, adminUpsertByField } from '@/lib/pbAdmin';
import { decideClaim, type DeviceClaim } from '@/lib/core/attendanceDevice';

export const runtime = 'edge';

// POST { deviceId, label, force? }: "may this device mark my attendance?" The phone asks about once a minute and before every clock-in/out.
// The first device to ask owns it; another phone is refused (and told which device has it) until the owner goes quiet, or it passes force
// (the person tapped "Use this device"). Kept in hr_system_state, one row per person, so no new table is needed.
export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(deviceId)) return NextResponse.json({ error: 'A device id is required.' }, { status: 400 });
  const label = (typeof body.label === 'string' ? body.label : '').trim().slice(0, 60) || 'another device';

  try {
    const key = `attendance_device:${session.email.toLowerCase()}`;
    const existing = (await adminFindByField('hr_system_state', 'key', key))?.data as DeviceClaim | undefined;
    const decision = decideClaim(existing, { deviceId, label }, Date.now(), body.force === true);
    if (decision.owner) await adminUpsertByField('hr_system_state', 'key', key, decision.claim);
    return NextResponse.json({ owner: decision.owner, ownerLabel: decision.ownerLabel });
  } catch (err) {
    console.error('[attendance/device] error:', err);
    return NextResponse.json({ error: 'Could not check which device marks attendance.' }, { status: 502 });
  }
}
