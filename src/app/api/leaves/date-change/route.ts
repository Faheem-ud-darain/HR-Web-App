import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import type { PbRow } from '@/lib/pbTypes';
import { adminListAll } from '@/lib/pbAdmin';
import { pbFilter } from '@/lib/pbFilter';
import { ChangeError, cancelChange, decideChange, requestChange } from '@/lib/core/leaveDateChangeFlow';
import { CHANGES, changesConfigured, pocketBaseLeaveChangeStore, toChange } from '@/lib/server/leaveChangeStore';

export const runtime = 'edge';

// Changing the dates of a leave request that already exists (it used to be done by hand in the database).
//   GET   the employee's own requests; HR and Admin get every request still waiting
//   POST  { action: 'request', leaveId, newStart, newEnd, reason }   an employee asks (their own leave only)
//         { action: 'cancel',  changeId }                           an employee withdraws a waiting request
//         { action: 'approve' | 'reject', changeId }                HR or Admin answers; approving moves the leave
// Every rule is checked here (core/leaveDateChange.ts); the browser only says which leave and which days.
const NOT_SET_UP = 'Leave date changes are not set up yet. Ask Admin to run the set-up.';
const ID = /^[a-z0-9]{15}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  if (!(await changesConfigured())) return NextResponse.json({ configured: false, requests: [] });
  try {
    const staff = session.role === 'hr' || session.role === 'admin';
    const store = pocketBaseLeaveChangeStore();
    let rows: PbRow[];
    if (staff) {
      rows = await adminListAll(CHANGES, `sort=-created&filter=${encodeURIComponent('status = "pending"')}`);
    } else {
      const me = await store.employeeByEmail(session.email);
      rows = me ? await adminListAll(CHANGES, `sort=-created&filter=${encodeURIComponent(pbFilter('employee_name = {:n}', { n: me.fullName }))}`) : [];
    }
    return NextResponse.json({ configured: true, requests: rows.map(toChange) });
  } catch (err) {
    console.error('[leaves/date-change GET] error:', err);
    return NextResponse.json({ error: 'Could not load the requests.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  let body: PbRow;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const staff = session.role === 'hr' || session.role === 'admin';
  const { action } = body ?? {};
  if (!(await changesConfigured())) return NextResponse.json({ error: NOT_SET_UP }, { status: 503 });

  const store = pocketBaseLeaveChangeStore();
  const now = new Date();
  try {
    if (action === 'request' || action === 'cancel') {
      if (staff) return NextResponse.json({ error: 'Only the employee asks to change their own leave.' }, { status: 403 });
      if (action === 'request') {
        const { leaveId, newStart, newEnd, reason } = body;
        if (typeof leaveId !== 'string' || !ID.test(leaveId) || typeof newStart !== 'string' || !DAY.test(newStart) || typeof newEnd !== 'string' || !DAY.test(newEnd) || typeof reason !== 'string') {
          return NextResponse.json({ error: 'leaveId, newStart, newEnd and reason are required.' }, { status: 400 });
        }
        return NextResponse.json({ ok: true, change: await requestChange(store, { email: session.email, leaveId, newStart, newEnd, reason, now }) });
      }
      if (typeof body.changeId !== 'string' || !ID.test(body.changeId)) return NextResponse.json({ error: 'changeId is required.' }, { status: 400 });
      await cancelChange(store, { email: session.email, changeId: body.changeId });
      return NextResponse.json({ ok: true });
    }
    if (action === 'approve' || action === 'reject') {
      if (!staff) return NextResponse.json({ error: 'Only HR or Admin can answer a request.' }, { status: 403 });
      if (typeof body.changeId !== 'string' || !ID.test(body.changeId)) return NextResponse.json({ error: 'changeId is required.' }, { status: 400 });
      const decidedBy = session.role === 'admin' ? 'CEO Admin' : 'HR Manager';
      return NextResponse.json({ ok: true, change: await decideChange(store, { changeId: body.changeId, decision: action, decidedBy, now }) });
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    if (err instanceof ChangeError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[leaves/date-change POST] error:', err);
    return NextResponse.json({ error: 'Could not save the change request.' }, { status: 500 });
  }
}
