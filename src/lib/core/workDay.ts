// How long a working day is for one person, and the shortest day that still counts as worked. The ONE place these numbers live:
// payroll, absence detection, the shift screens and every label read them from here, so a part-time employee (5 hours) and a full-time
// one (8 hours) can never be priced by different rules.
import { isStaffRole } from './profiles';

export const FULL_DAY_MINUTES = 8 * 60;
export const PART_TIME_DAY_MINUTES = 5 * 60;

type HasPartTime = { partTime?: boolean } | null | undefined;

/** A full day for this person: 8 hours, or 5 for a part-time employee. A day this long or longer has no shortfall. */
export const requiredDayMinutes = (p: HasPartTime): number => (p?.partTime ? PART_TIME_DAY_MINUTES : FULL_DAY_MINUTES);

/** Under this a day counts as an absence (2 days' pay); from here up to a full day only the missing share is deducted. Half a day: 4 of 8, 2.5 of 5. */
export const absenceFloorMinutes = (p: HasPartTime): number => requiredDayMinutes(p) / 2;

/** Minutes as plain hours for a sentence: 240 -> "4", 150 -> "2.5". */
export const hoursText = (minutes: number): string => String(Math.round((minutes / 60) * 10) / 10);

/** Who may see that someone is part-time: HR, Admin, and the employee themselves. Nobody else, so colleagues never see it. */
export const canSeePartTime = (viewer: { email?: string | null; role?: string | null }, employeeEmail: string): boolean =>
  isStaffRole(viewer.role) || (!!viewer.email && viewer.email.toLowerCase() === (employeeEmail || '').toLowerCase());
