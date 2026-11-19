'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrActions, useLeaves, usePayroll, useProfiles, useTimesheets, type PayrollRecord, type Profile, type LeaveApplication, type TimesheetEntry, type AbsenceRecord } from '@/lib/hrData';
import { daysAgoNYDateString } from '@/lib/timezone';

const NO_EMPLOYEES: Profile[] = [];
const NO_RECORDS: PayrollRecord[] = [];
const NO_LEAVES: LeaveApplication[] = [];
const NO_SHEETS: TimesheetEntry[] = [];
const NO_ABSENCES: AbsenceRecord[] = [];

/**
 * The company's payroll for the month in view, worked out in the browser from everything the engine needs: profiles, the
 * saved payroll rows, leaves, the last 45 days of shifts (short-shift deductions) and 120 days of absence records. The payroll
 * screen and the Admin dashboard's "Monthly Payroll" both use this one hook, so they cannot show different totals: the
 * dashboard used to leave out shifts and absences and overstate pay. (Saving is separate and worked out on the server.)
 */
export function usePayrollView({ previous = false }: { previous?: boolean } = {}) {
  const payrollQ = usePayroll();
  const profilesQ = useProfiles();
  const leavesQ = useLeaves();
  const sheetsQ = useTimesheets({ days: 45 });
  // A strict read: a failed request is an error, not "no absences" (which would leave the deductions out and overstate everyone's pay).
  const absencesQ = useQuery({
    queryKey: ['hr_absence_records', 'payroll'],
    queryFn: () => hrActions.getAbsenceRecordsStrict({ sinceDate: daysAgoNYDateString(120) }),
    staleTime: 60_000,
    retry: 2,
  });
  const rawPayroll = payrollQ.data ?? NO_RECORDS;
  const employees = profilesQ.data ?? NO_EMPLOYEES;
  const leaves = leavesQ.data ?? NO_LEAVES;
  const timesheets = sheetsQ.data ?? NO_SHEETS;
  const absenceRecords = absencesQ.data ?? NO_ABSENCES;
  const queries = [payrollQ, profilesQ, leavesQ, sheetsQ, absencesQ];
  // The totals are only real when EVERY input has arrived. Until then (or if one failed) the screens show that, never a partial total.
  const loading = queries.some(q => q.isLoading);
  const failed = !loading && queries.some(q => q.data === undefined);
  const records = useMemo(
    () => hrActions.computePayrollView(employees, rawPayroll, leaves, timesheets, absenceRecords, new Date(), previous),
    [employees, rawPayroll, leaves, timesheets, absenceRecords, previous],
  );
  const retry = () => { queries.forEach(q => { if (q.data === undefined) void q.refetch(); }); };
  return { records, employees, rawPayroll, loading, failed, retry, refetchPayroll: payrollQ.refetch, refetchProfiles: profilesQ.refetch };
}
