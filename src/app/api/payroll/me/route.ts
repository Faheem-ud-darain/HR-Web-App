import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { adminFindProfileByEmail, adminListPayrollForEmployee, adminGetKV } from '@/lib/pbAdmin';
import { getPendingIncrement } from '@/lib/incrementMath';

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
    const payrollRecord = payrollRows[0] || null;

    // lastIncrementProcessedYear isn't a real hr_profiles column — like
    // `offboarded`, it lives in the hr_profile_extra_ KV overlay (see
    // getProfileExtras/saveProfileExtras in hrData.ts). Has to be fetched
    // separately from the profile record itself.
    const extras = await adminGetKV(`hr_profile_extra_${profile.id}`);

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
    };
    const pendingIncrement = getPendingIncrement(profileForClient);

    return NextResponse.json({
      profile: profileForClient,
      pendingIncrement,
      payrollRecord: payrollRecord
        ? {
            bonus: Number(payrollRecord.bonus) || 0,
            deductions: Number(payrollRecord.deductions) || 0,
            processed: !!payrollRecord.processed,
          }
        : null,
    });
  } catch (err: any) {
    console.error('[payroll/me] error:', err);
    return NextResponse.json({ error: 'Could not load payroll data.' }, { status: 500 });
  }
}
