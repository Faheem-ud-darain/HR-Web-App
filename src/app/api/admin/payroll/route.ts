import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { pbAdminFetch, adminUpsertByField, adminListAllPayroll, adminListPayrollForEmployee, adminDeletePayrollForEmployee, adminFindProfileByEmail } from '@/lib/pbAdmin';
import type { PbRow } from '@/lib/pbTypes';
import { toPayrollRecordFromRow, toPayrollRowFields } from '@/lib/core/payrollMappers';

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

// HR/Admin-privileged write to a single hr_payroll record — the
// counterpart to the read-only /api/payroll/me route (self, GET-only).
// This does NOT cover reading the full company payroll list yet: that page
// (hr/payroll, admin/payroll) still computes its view client-side via
// hrActions.computePayrollView, fed by the public useProfiles()/usePayroll()/
// useLeaves()/useTimesheets() hooks — proxying that whole read path is a
// separate, larger piece (it needs an authenticated equivalent of four
// different public collections at once) that's intentionally being left for
// its own pass rather than rushed in here. What IS covered: the actual
// "Process Payroll" / "Release Monthly Funds" WRITE that marks a record
// paid and sets its final numbers — that no longer goes through the
// anonymous public client.
//
// Mirrors hrActions.upsertPayrollRecord's exact field mapping so behavior
// is unchanged, just authenticated.

function looksLikeRealId(id: string | undefined | null): boolean {
  // Same heuristic as hrData.ts's looksLikeRealId — PocketBase record ids
  // are exactly 15 characters; anything else (e.g. a locally-generated
  // placeholder id for a not-yet-created record) means "create", not
  // "update".
  return !!id && id.length === 15;
}

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

  const record = body?.record;
  if (!record || typeof record !== 'object') {
    return NextResponse.json({ error: 'record is required.' }, { status: 400 });
  }

  try {
    const fields = toPayrollRowFields(record, new Date().toISOString().split('T')[0]);

    if (looksLikeRealId(record.id)) {
      await pbAdminFetch(`/api/collections/hr_payroll/records/${record.id}`, {
        method: 'PATCH',
        body: JSON.stringify(fields),
      });
    } else {
      await pbAdminFetch(`/api/collections/hr_payroll/records`, {
        method: 'POST',
        body: JSON.stringify(fields),
      });
    }

    // Persist the itemized "why was I deducted" breakdown + this month's
    // reserved amount alongside the main record, so the employee's own
    // /api/payroll/me view can show the exact same reasons HR/Admin see on
    // the Net Payable modal — computePayrollView (client-side only, not
    // Edge-safe) already computed both of these; this route just needs to
    // carry them through to storage, not recompute them.
    if (record.employeeId && record.month) {
      await adminUpsertByField('hr_payroll_breakdowns', 'breakdown_key', payrollBreakdownKey(record.employeeId, record.month), {
        deductionBreakdown: Array.isArray(record.deductionBreakdown) ? record.deductionBreakdown : [],
        reservedThisMonth: Number(record.reservedThisMonth) || 0,
        // New-joiner pay timing (see core/payroll.ts): the part-month pay set aside this month, and the
        // earlier part-month pay added to this month. Stored so a later reader sees what was paid.
        deferredThisMonth: Number(record.deferredThisMonth) || 0,
        earlierPay: Number(record.earlierPay) || 0,
        earlierPayLabel: typeof record.earlierPayLabel === 'string' ? record.earlierPayLabel.slice(0, 120) : '',
        // Once a month is frozen (or paid) its numbers are final — see core/payroll.ts.
        frozen: record.frozen === true || record.processed === true,
        frozenAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
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
