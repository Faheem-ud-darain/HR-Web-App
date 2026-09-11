import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { adminFindProfileByEmail, adminListPayrollForEmployee, adminFindByField } from '@/lib/pbAdmin';
import { getPendingIncrement } from '@/lib/incrementMath';
import { getNYDateString } from '@/lib/timezone';
import { adminListAbsenceRecordsForEmail } from '@/lib/pbAdmin';

export const runtime = 'edge';

// Server-side replacement for employee/salary/page.tsx's old pattern of
// calling usePayroll() (fetches EVERY employee's hr_payroll record) and
// useProfiles() (fetches EVERY employee's hr_profiles record, base salary
// included) into the browser, then filtering client-side down to just the
// signed-in employee's own numbers. Anyone hitting those PocketBase
// endpoints directly — not through the app at all — got the same full
// company-wide salary list, no auth required. This route uses a real
// PocketBase admin token server-side (src/lib/pbAdmin.ts) and only ever
// returns the caller's own data, identified by their verified session JWT
// (src/lib/serverAuth.ts), not anything the client can pass in and choose.
export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const profile = await adminFindProfileByEmail(session.email);
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    }

    const payrollRows = await adminListPayrollForEmployee(profile.id);
    // Same "most recent record for this employee" selection the old
    // client-side usePayroll().find(p => p.employeeId === profile.id) did —
    // adminListPayrollForEmployee already sorts by -created, so [0] is it.
    let payrollRecord = payrollRows[0] || null;

    // BUGFIX 2026-09-08: the most recent record isn't necessarily FOR the
    // current month — until HR/Admin runs payroll for a new month, [0]
    // above is still last month's already-processed record. The dashboard
    // and Salary page both label this "This Month" / "Net Payable This
    // Month", so showing last month's leftover bonus/deductions/processed
    // status under that label was actively misleading right after a month
    // rolled over — it looked like this month's numbers when it wasn't.
    // Same America/New_York month-bucketing computePayrollView itself uses.
    const currentMonthKey = getNYDateString(new Date()).slice(0, 7); // "YYYY-MM"
    const recordIsCurrentMonth = payrollRecord?.month === currentMonthKey;
    if (payrollRecord && !recordIsCurrentMonth) {
      payrollRecord = { ...payrollRecord, month: currentMonthKey, bonus: 0, deductions: 0, processed: false };
    }

    // Live running total of this month's daily deductions (hr_absence_records)
    // — real-time and always current even before HR has run/saved a formal
    // payroll record for this month, so "Net Payable This Month" reflects
    // actual deductions so far rather than showing 0 all month until HR
    // processes it. Once HR does process the month, their saved
    // `deductions` figure (already includes leave/shift-shortfall deductions
    // beyond just absences) takes over as the authoritative number instead.
    let liveDeductionsThisMonth = 0;
    if (!recordIsCurrentMonth) {
      try {
        const absenceRows = await adminListAbsenceRecordsForEmail(session.email);
        liveDeductionsThisMonth = absenceRows
          .filter((r: any) => typeof r.date === 'string' && r.date.slice(0, 7) === currentMonthKey)
          .reduce((sum: number, r: any) => sum + (Number(r.deductionAmount) || 0), 0);
      } catch { /* best-effort — worst case the dashboard shows 0 until HR processes */ }
    }

    // Itemized "why was I deducted" breakdown + this month's reserved
    // amount — written by /api/admin/payroll alongside the main record
    // (see that route's comment) since computePayrollView, which computes
    // both, isn't Edge-safe to import here directly.
    let deductionBreakdown: { label: string; amount: number }[] = [];
    let reservedThisMonth = 0;
    if (payrollRecord?.month) {
      // Plan 027 Phase 2: hr_payroll_breakdowns (breakdown_key = employeeId_month, unique) instead of a hr_delcargo_store row per employee-month.
      const breakdownRow = await adminFindByField('hr_payroll_breakdowns', 'breakdown_key', `${profile.id}_${payrollRecord.month}`);
      if (breakdownRow?.data) {
        deductionBreakdown = Array.isArray(breakdownRow.data.deductionBreakdown) ? breakdownRow.data.deductionBreakdown : [];
        reservedThisMonth = Number(breakdownRow.data.reservedThisMonth) || 0;
      }
    }

    // lastIncrementProcessedYear isn't a real hr_profiles column — like
    // `offboarded`, it lives in the hr_profile_extras overlay collection
    // (plan 027; see getProfileExtras/saveProfileExtras in hrData.ts). Has
    // to be fetched separately from the profile record itself.
    const extrasRow = await adminFindByField('hr_profile_extras', 'profile_id', profile.id);
    const extras = { value: extrasRow?.data };

    // Only the specific fields the Salary page's math (getPendingIncrement/
    // getIncrementHistory) and display actually need — deliberately not the
    // full profile record (no password, no bank details, etc.), so this
    // route can't become a second way to leak everything hr_profiles holds.
    // fullName/teams/id are included since the payslip receipt view shows
    // them — none of those 3 are sensitive on their own.
    const profileForClient = {
      id: profile.id,
      fullName: profile.full_name,
      teams: profile.teams || [],
      baseSalary: Number(profile.base_salary) || 0,
      salaryStartDate: profile.salary_start_date || undefined,
      joinedDate: profile.joined_date,
      lastIncrementProcessedYear: extras?.value?.lastIncrementProcessedYear || undefined,
      region: profile.region,
      // Reserved-balance fields (item 3/8) — read the same way
      // lastIncrementProcessedYear is above, straight off the overlay.
      reservedSalaryBalance: Number(extras?.value?.reservedSalaryBalance) || 0,
      manualReservedAmount: Number(extras?.value?.manualReservedAmount) || 0,
    };
    const pendingIncrement = getPendingIncrement(profileForClient);

    return NextResponse.json({
      profile: profileForClient,
      pendingIncrement,
      payrollRecord: payrollRecord
        ? {
            bonus: Number(payrollRecord.bonus) || 0,
            deductions: recordIsCurrentMonth ? (Number(payrollRecord.deductions) || 0) : liveDeductionsThisMonth,
            processed: !!payrollRecord.processed,
            month: payrollRecord.month || undefined,
            deductionBreakdown,
            reservedThisMonth,
          }
        : (liveDeductionsThisMonth > 0
            // No payroll record has EVER been created for this employee yet
            // (brand new hire, first month) but they already have absence
            // deductions on the books this month — still surface those
            // rather than showing nothing at all until HR's first run.
            ? { bonus: 0, deductions: liveDeductionsThisMonth, processed: false, month: currentMonthKey, deductionBreakdown: [], reservedThisMonth: 0 }
            : null),
    });
  } catch (err: any) {
    console.error('[payroll/me] error:', err);
    return NextResponse.json({ error: 'Could not load payroll data.' }, { status: 500 });
  }
}
