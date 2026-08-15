import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { pbAdminFetch } from '@/lib/pbAdmin';

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

  let body: Record<string, any>;
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
    const fields = {
      employee_id: record.employeeId,
      employee_name: record.name,
      role: record.role,
      region: record.region || 'Pakistan',
      base_salary: record.baseSalary,
      unpaid_leaves: record.unpaidLeaves,
      bonus: record.bonus,
      deductions: record.deductions,
      net_pay: record.baseSalary + record.bonus - record.deductions + record.incrementAmount,
      increment_amount: record.incrementAmount,
      processed: record.processed,
      status: record.processed ? 'paid' : 'pending',
      paid_date: record.processed ? new Date().toISOString().split('T')[0] : '',
    };

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

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[admin/payroll POST] error:', err);
    return NextResponse.json({ error: 'Could not save payroll record.' }, { status: 500 });
  }
}
