import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { pbAdminFetch, adminAddNotification } from '@/lib/pbAdmin';
import { pbFilter } from '@/lib/pbFilter';
import { planCorrection, type PayrollCorrection } from '@/lib/core/payrollCorrections';
import { monthLabel } from '@/lib/core/payrollView';
import type { PbRow } from '@/lib/pbTypes';

export const runtime = 'edge';

// Corrections after payment (plan 028; rules in lib/core/payrollCorrections.ts).
//   GET   HR/Admin  every correction (newest first)
//   POST  HR/Admin  { employeeId, month, correctedAmount, reason } — records a correction on a month
//                   that is already marked paid, tells the employee, never edits the paid record
//   PATCH Admin     { id, note? } — marks one correction's difference as settled (paid out or recovered)
// Stored in hr_payroll_corrections (admin-only; created by the schema-migration action
// ensurePayrollCorrections). Until that exists, GET answers { configured: false } and POST/PATCH say so.
const COLLECTION = 'hr_payroll_corrections';

const num = (v: unknown) => Number(v) || 0;
function toCorrection(r: PbRow): PayrollCorrection {
  return {
    id: r.id, employeeId: r.employee_id, employeeName: r.employee_name, month: r.month, region: r.region || 'Pakistan',
    previousAmount: num(r.previous_amount), correctedAmount: num(r.corrected_amount), difference: num(r.difference),
    reason: r.reason || '', createdAt: r.created, createdBy: r.created_by || '', createdByRole: r.created_by_role || '',
    settled: !!r.settled, settledAt: r.settled_at || undefined, settledBy: r.settled_by || undefined, settlementNote: r.settlement_note || undefined,
  };
}
const isMissingCollection = (err: unknown) => /\b404\b/.test(String((err as Error)?.message || ''));

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session || (session.role !== 'hr' && session.role !== 'admin')) return NextResponse.json({ error: 'HR or Admin only.' }, { status: 403 });
  try {
    const list = await pbAdminFetch(`/api/collections/${COLLECTION}/records?perPage=500&sort=-created`);
    return NextResponse.json({ configured: true, corrections: ((list?.items || []) as PbRow[]).map(toCorrection) });
  } catch (err) {
    if (isMissingCollection(err)) return NextResponse.json({ configured: false, corrections: [] });
    console.error('[payroll/corrections GET] error:', err);
    return NextResponse.json({ error: 'Could not load corrections.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session || (session.role !== 'hr' && session.role !== 'admin')) return NextResponse.json({ error: 'HR or Admin only.' }, { status: 403 });
  let body: PbRow;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const employeeId = typeof body.employeeId === 'string' ? body.employeeId : '';
  const month = typeof body.month === 'string' ? body.month : '';
  if (!/^[A-Za-z0-9]{6,30}$/.test(employeeId) || !/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'A valid employee and month are required.' }, { status: 400 });

  try {
    // The month must exist and already be paid; otherwise just edit it normally.
    const recs = await pbAdminFetch(`/api/collections/hr_payroll/records?perPage=5&filter=${encodeURIComponent(pbFilter('employee_id = {:id} && month = {:m}', { id: employeeId, m: month }))}`);
    const paid = ((recs?.items || []) as PbRow[]).find(r => r.processed);
    if (!paid) return NextResponse.json({ error: 'That month has not been marked as paid, so it can be changed directly instead of corrected.' }, { status: 400 });

    const earlierList = await pbAdminFetch(`/api/collections/${COLLECTION}/records?perPage=200&filter=${encodeURIComponent(pbFilter('employee_id = {:id} && month = {:m}', { id: employeeId, m: month }))}`);
    const earlier = ((earlierList?.items || []) as PbRow[]).map(toCorrection);
    const paidAmount = num(paid.net_pay) || (num(paid.base_salary) + num(paid.bonus) - num(paid.deductions) + num(paid.increment_amount));
    const plan = planCorrection({ paidAmount, earlier, correctedAmount: body.correctedAmount, reason: body.reason });
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 });

    const created = await pbAdminFetch(`/api/collections/${COLLECTION}/records`, {
      method: 'POST',
      body: JSON.stringify({
        employee_id: employeeId, employee_name: paid.employee_name, month, region: paid.region || 'Pakistan',
        previous_amount: plan.previousAmount, corrected_amount: plan.correctedAmount, difference: plan.difference, reason: plan.reason,
        created_by: session.email, created_by_role: session.role, settled: false,
      }),
    });

    // Tell the employee what changed and why (best-effort — the correction is already recorded).
    try {
      const profile = await pbAdminFetch(`/api/collections/hr_profiles/records/${employeeId}?fields=email`);
      if (profile?.email) {
        const money = (n: number) => `${paid.region === 'USA' ? '$' : 'PKR '}${Math.abs(n).toLocaleString('en-US')}`;
        await adminAddNotification(profile.email, 'employee',
          `Your salary for ${monthLabel(month)} was corrected from ${money(plan.previousAmount)} to ${money(plan.correctedAmount)} (${plan.difference > 0 ? `${money(plan.difference)} more is owed to you` : `${money(plan.difference)} more was paid than due`}). Reason: ${plan.reason}`,
          'internal');
      }
    } catch (err) { console.error('[payroll/corrections] employee notice failed:', err); }

    return NextResponse.json({ ok: true, correction: toCorrection(created) });
  } catch (err) {
    if (isMissingCollection(err)) return NextResponse.json({ error: 'Corrections have not been set up yet. Ask your developer to run the setup step (ensurePayrollCorrections).' }, { status: 503 });
    console.error('[payroll/corrections POST] error:', err);
    return NextResponse.json({ error: 'Could not save the correction. Nothing was changed.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await requireSession(request);
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Only Admin can mark a correction as settled.' }, { status: 403 });
  let body: PbRow;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const id = typeof body.id === 'string' ? body.id : '';
  if (!/^[A-Za-z0-9]{6,30}$/.test(id)) return NextResponse.json({ error: 'A valid correction is required.' }, { status: 400 });
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';
  try {
    const row = await pbAdminFetch(`/api/collections/${COLLECTION}/records/${id}`);
    if (row.settled) return NextResponse.json({ ok: true, correction: toCorrection(row) }); // already settled: nothing to do
    const updated = await pbAdminFetch(`/api/collections/${COLLECTION}/records/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ settled: true, settled_at: new Date().toISOString(), settled_by: session.email, settlement_note: note }),
    });
    return NextResponse.json({ ok: true, correction: toCorrection(updated) });
  } catch (err) {
    if (isMissingCollection(err)) return NextResponse.json({ error: 'Corrections have not been set up yet.' }, { status: 503 });
    console.error('[payroll/corrections PATCH] error:', err);
    return NextResponse.json({ error: 'Could not mark it as settled.' }, { status: 500 });
  }
}
