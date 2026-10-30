import { displayName, useProfiles, type Profile } from '@/lib/hrData';

/**
 * A leave only snapshots the employee's full name, not a live Profile, so the name to show (their alias, for the role looking) and
 * their photo come from a lookup in the current employees list; an employee who cannot be matched (since deleted) keeps the snapshot.
 */
export function useLeaveNames(role: 'hr' | 'admin') {
  const { data: employees = [] } = useProfiles();
  const find = (employeeName: string): Profile | undefined => employees.find(e => e.fullName === employeeName);
  return {
    nameFor: (employeeName: string): string => { const emp = find(employeeName); return emp ? displayName(emp, role) : employeeName; },
    pictureFor: (employeeName: string): string | undefined => find(employeeName)?.profilePicture,
  };
}
