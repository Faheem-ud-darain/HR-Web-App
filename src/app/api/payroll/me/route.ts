import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { adminFindProfileByEmail, adminGetExtras } from '@/lib/pbAdmin';
import { getPendingIncrement } from '@/lib/incrementMath';
import { mapProfileRecord } from '@/lib/core/profiles';
import { selfPayrollRecord, selfPayrollSince } from '@/lib/core/payrollSelf';
import { loadPayrollInputsFor } from '@/lib/server/payrollInputs';

export const runtime = 'edge';

// The signed-in employee's OWN pay, and only theirs. Server-side so the browser never downloads the whole company's
// salaries: this route uses the PocketBase admin token (src/lib/pbAdmin.ts) and identifies the caller by their verified
// session JWT (src/lib/serverAuth.ts), never by anything the client sends.
//
// It carries no pay rules. It loads this one person's rows (five small filtered reads, see loadPayrollInputsFor) and asks
// the same engine the HR and Admin screens and the monthly job use (core/payrollSelf.ts), so the dashboard, the Salary
// page and HR's payroll screen show the same figures. About eight outgoing requests in all, well inside the Edge limit.
export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const row = await adminFindProfileByEmail(session.email);
    if (!row) {
      return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    }

    // lastIncrementProcessedYear and the reserved-balance amounts are not hr_profiles columns: they live in the
    // hr_profile_extras overlay (plan 027) and have to be read separately.
    const profile = mapProfileRecord(row, await adminGetExtras(row.id));

    const now = new Date();
    const inputs = await loadPayrollInputsFor(profile, now, selfPayrollSince(now));
    const record = selfPayrollRecord(profile, inputs, now);

    // Only the fields the Salary page's maths and display need: deliberately not the full profile (no password, no bank
    // details), so this route cannot become a second way to leak everything hr_profiles holds.
    const profileForClient = {
      id: profile.id,
      fullName: profile.fullName,
      teams: profile.teams || [],
      baseSalary: profile.baseSalary,
      salaryStartDate: row.salary_start_date || undefined,
      joinedDate: profile.joinedDate,
      lastIncrementProcessedYear: profile.lastIncrementProcessedYear || undefined,
      region: profile.region,
      reservedSalaryBalance: Number(profile.reservedSalaryBalance) || 0,
      manualReservedAmount: Number(profile.manualReservedAmount) || 0,
    };

    return NextResponse.json({
      profile: profileForClient,
      // What is still waiting to be added to the base salary (the "pending increment" card). The amount that counts in THIS
      // month's pay is payrollRecord.incrementAmount, which follows the payroll rule (from the month after the anniversary).
      pendingIncrement: getPendingIncrement(profileForClient),
      payrollRecord: record
        ? {
            baseSalary: record.baseSalary,
            incrementAmount: record.incrementAmount,
            earlierPay: record.earlierPay || 0,
            bonus: record.bonus,
            deductions: record.deductions,
            processed: record.processed,
            // False while the month is still open: the figures are an estimate until HR processes (or the job freezes) it.
            final: record.final,
            month: record.month,
            deductionBreakdown: record.deductionBreakdown || [],
            reservedThisMonth: record.reservedThisMonth || 0,
          }
        : null,
    });
  } catch (err) {
    console.error('[payroll/me] error:', err);
    return NextResponse.json({ error: 'Could not load payroll data.' }, { status: 500 });
  }
}
