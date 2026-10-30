import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { pbAdminFetch, adminListAllPayroll, adminListPayrollForEmployee, adminDeletePayrollForEmployee, adminFindProfileByEmail } from '@/lib/pbAdmin';
import type { PbRow } from '@/lib/pbTypes';
import { toPayrollRecordFromRow } from '@/lib/core/payrollMappers';
import { PayError, payEmployee, recordPaid, setBonus } from '@/lib/core/payrollPay';
import { pocketBasePayStore } from '@/lib/server/payrollPayStore';

// Same "why was I deducted" breakdown key scheme /api/payroll/me reads back
// (see that route's comment) — not a real hr_payroll column (the live
// schema has none free for it). Plan 027 Phase 2: its own
// hr_payroll_breakdowns collection instead of a hr_delcargo_store row,
// keyed by employeeId + month (breakdown_key, unique) so each calendar
// month keeps its own row.
function payrollBreakdownKey(employeeId: string, month: string) {
  return `${employeeId}_${month}`;
}

export const runtime = 'edge';

// HR/Admin writes to payroll. The browser says WHO, WHICH MONTH and WHAT HR typed (a bonus); every figure is worked out
// here from the stored data by the same engine as everywhere else (core/payrollPay.ts), never taken from the request:
//   { action: 'pay',        employeeId, month }          freeze the month, add any raise, bank the held-back pay, mark paid
//   { action: 'recordPaid', employeeId, month }          an earlier month that was paid but never ticked off: only marks it paid
//   { action: 'setBonus',   employeeId, month, bonus }   HR's bonus on a month that is not paid yet
// Paying is for Admin (the screen only shows the button to Admin); the bonus is for HR and Admin.
const EMPLOYEE_ID = /^[a-z0-9]{15}$/;

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  if (session.role !== 'hr' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  let body: PbRow;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { action, employeeId, month } = body ?? {};
  if (typeof employeeId !== 'string' || !EMPLOYEE_ID.test(employeeId) || typeof month !== 'string') {
    return NextResponse.json({ error: 'employeeId and month are required.' }, { status: 400 });
  }
  if ((action === 'pay' || action === 'recordPaid') && session.role !== 'admin') {
    return NextResponse.json({ error: 'Only Admin can mark a salary as paid.' }, { status: 403 });
  }

  const store = pocketBasePayStore();
  const now = new Date();
  try {
    if (action === 'pay') return NextResponse.json({ ok: true, ...(await payEmployee(store, { employeeId, month, now })) });
    if (action === 'recordPaid') return NextResponse.json({ ok: true, ...(await recordPaid(store, { employeeId, month, now })) });
    if (action === 'setBonus') return NextResponse.json({ ok: true, ...(await setBonus(store, { employeeId, month, bonus: Number(body.bonus), now })) });
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    if (err instanceof PayError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[admin/payroll POST] error:', err);
    return NextResponse.json({ error: 'Could not save payroll record.' }, { status: 500 });
  }
}

// Server-side mapping from a raw hr_payroll PocketBase record to the
// client's PayrollRecord shape — mirrors toPayroll() in hrData.ts (that
// mapper lives in a client-only module full of browser-side pb calls, so
// it isn't safe to import into this Edge route; the mapping itself is
// trivial enough that duplicating it here is simpler than restructuring
// hrData.ts to share it, matching how the career-applications route
// already keeps its own local toCareerApplication() mapper).
// GET — replaces the old public usePayroll() (pb.collection('hr_payroll').getFullList())
// now that hr_payroll's PocketBase rules are locked to admins-only (plan 012
// Phase 1). Two scopes, both authenticated by the verified session, never by
// anything the client claims about itself:
//   - ?employeeId=<id> — HR/Admin only, one employee's rows (used by
//     exportEmployeeArchive's "Download Archive" action, via
//     getPayrollForEmployeeAdmin in hrData.ts).
//   - no query param — HR/Admin gets the full company-wide list (the
//     existing admin/payroll, hr/payroll, admin dashboard, and admin/insights
//     pages, all already role-gated); anyone else gets only their OWN
//     records, matched the same way /api/payroll/me does, so TopNav's
//     universal search bar (every role renders it) still works for a plain
//     employee without ever fetching anyone else's payroll data.
export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const url = new URL(request.url);
  const employeeId = url.searchParams.get('employeeId');
  const isPrivileged = session.role === 'hr' || session.role === 'admin';

  try {
    let rows: PbRow[];
    if (employeeId) {
      if (!isPrivileged) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
      rows = await adminListPayrollForEmployee(employeeId);
    } else if (isPrivileged) {
      rows = await adminListAllPayroll();
    } else {
      const profile = await adminFindProfileByEmail(session.email);
      rows = profile ? await adminListPayrollForEmployee(profile.id) : [];
    }
    // Frozen months carry their stored breakdown (one list read; keyed employeeId_month).
    const stored = new Map<string, PbRow>();
    if (rows.some((r: PbRow) => r.month)) {
      try {
        // Paged: paid months depend on their stored breakdown, so a cut-off at 500 rows would make
        // the oldest ones fall back to a generic breakdown as the company grows.
        for (let page = 1; page <= 20; page++) {
          const list = await pbAdminFetch(`/api/collections/hr_payroll_breakdowns/records?perPage=500&page=${page}&sort=created&fields=breakdown_key,data`);
          const items: PbRow[] = list?.items || [];
          for (const b of items) stored.set(String(b.breakdown_key), b.data || {});
          if (items.length < 500) break;
        }
      } catch (err) {
        console.error('[admin/payroll GET] breakdowns unavailable:', err);
      }
    }
    return NextResponse.json({ records: rows.map((r: PbRow) => toPayrollRecordFromRow(r, stored.get(payrollBreakdownKey(r.employee_id, r.month || '')))) });
  } catch (err) {
    console.error('[admin/payroll GET] error:', err);
    return NextResponse.json({ error: 'Could not load payroll records.' }, { status: 500 });
  }
}

// DELETE — HR/Admin only, purges every hr_payroll row for one employee.
// Used by hrData.ts's deleteEmployee purge flow (was previously a direct
// public pbList+pbDelete pair against hr_payroll).
export async function DELETE(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  if (session.role !== 'hr' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const employeeId = url.searchParams.get('employeeId');
  if (!employeeId) return NextResponse.json({ error: 'employeeId is required.' }, { status: 400 });

  try {
    await adminDeletePayrollForEmployee(employeeId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/payroll DELETE] error:', err);
    return NextResponse.json({ error: 'Could not delete payroll records.' }, { status: 500 });
  }
}
