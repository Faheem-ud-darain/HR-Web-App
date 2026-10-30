'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrActions, useLeaves, usePayroll, useProfiles, useTimesheets, type PayrollRecord, type Profile } from '@/lib/hrData';
import { daysAgoNYDateString } from '@/lib/timezone';

const NO_EMPLOYEES: Profile[] = [];
const NO_RECORDS: PayrollRecord[] = [];

/**
 * The company's payroll for the month in view, worked out in the browser from everything the engine needs: profiles, the
 * saved payroll rows, leaves, the last 45 days of shifts (short-shift deductions) and 120 days of absence records. The payroll
 * screen and the Admin dashboard's "Monthly Payroll" both use this one hook, so they cannot show different totals: the
 * dashboard used to leave out shifts and absences and overstate pay. (Saving is separate and worked out on the server.)
 */
export function usePayrollView({ previous = false }: { previous?: boolean } = {}) {
  const { data: rawPayroll = NO_RECORDS, isLoading: payrollLoading, refetch: refetchPayroll } = usePayroll();
  const { data: employees = NO_EMPLOYEES, isLoading: profilesLoading, refetch: refetchProfiles } = useProfiles();
  const { data: leaves = [] } = useLeaves();
  const { data: timesheets = [] } = useTimesheets({ days: 45 });
  const { data: absenceRecords = [] } = useQuery({
    queryKey: ['hr_absence_records', 'payroll'],
    queryFn: () => hrActions.getAbsenceRecords({ sinceDate: daysAgoNYDateString(120) }),
    staleTime: 60_000,
  });
  const records = useMemo(
    () => hrActions.computePayrollView(employees, rawPayroll, leaves, timesheets, absenceRecords, new Date(), previous),
    [employees, rawPayroll, leaves, timesheets, absenceRecords, previous],
  );
  return { records, employees, rawPayroll, loading: payrollLoading || profilesLoading, refetchPayroll, refetchProfiles };
}
