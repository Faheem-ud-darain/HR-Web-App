import { formatMoney, type Profile, type TimesheetEntry } from '@/lib/hrData';
import { csvFilename, downloadCsv } from '@/lib/csv';
import { formatTimeNY } from '@/lib/timezone';

// The two spreadsheet downloads on the HR and Admin Reports pages.

export function exportEmployeesCsv(employees: Profile[]): void {
  const headers = ['Full Name', 'Email', 'Role', 'Region', 'Bank Name', 'Account Number', 'IBAN', 'Onboarding Status', 'Base Salary'];
  const rows = employees.map(emp => [
    emp.fullName,
    emp.email,
    emp.jobTitle || 'Employee',
    emp.region || 'Pakistan',
    emp.bankName || 'N/A',
    emp.accountNumber || 'N/A',
    emp.iban || 'N/A',
    emp.onboardingCompleted ? 'Completed' : 'Pending',
    formatMoney(emp.baseSalary, emp.region),
  ]);
  downloadCsv(csvFilename('DelCargo_Employee_Report'), [headers, ...rows]);
}

export function exportTimesheetCsv(employee: Profile, entries: TimesheetEntry[]): void {
  const headers = ['Date', 'Clock In', 'Clock Out', 'Duration', 'Status'];
  const rows = entries.map(e => [
    e.date || '',
    e.clockIn ? formatTimeNY(e.clockIn) : '—',
    e.clockOut ? formatTimeNY(e.clockOut) : '—',
    e.duration || '—',
    e.status === 'in_progress' ? 'On Shift' : 'Completed',
  ]);
  downloadCsv(csvFilename(`Tracking_${employee.fullName.replace(/\s+/g, '_')}`), [headers, ...rows]);
}
