import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { adminListAbsenceRecordsForEmail } from '@/lib/pbAdmin';

export const runtime = 'edge';

// Authenticated replacement for an employee's own view of hr_absence_records
// (daily attendance deductions — no-clock-in / inactivity / under-4-hours).
// Previously the only way to see this data was hrActions.getAbsenceRecords(),
// which reads the ENTIRE public hr_absence_records collection client-side —
// every employee's daily deduction history, no login required at all — and
// nothing employee-facing actually called it, so employees had no visibility
// into per-day deductions at all until the end-of-month payroll summary.
// This route returns only the calling employee's own, non-deleted records,
// verified via their real session JWT server-side — same pattern as
// /api/payroll/me.
export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const rows = await adminListAbsenceRecordsForEmail(session.email);
    const records = rows.map((r: any) => ({
      id: r.id,
      date: r.date,
      reason: r.reason,
      inactivityMinutes: r.inactivityMinutes || undefined,
      workedMinutes: r.workedMinutes || undefined,
      deductionAmount: Number(r.deductionAmount) || 0,
      createdAt: r.createdAt || r.created,
    }));
    return NextResponse.json({ items: records });
  } catch (err) {
    console.error('[absences/me] error:', err);
    return NextResponse.json({ error: 'Could not load absence records.' }, { status: 500 });
  }
}
