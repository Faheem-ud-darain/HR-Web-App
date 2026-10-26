// Made-up employees, pay, leave, tickets and tracker data for the assistant prototype.
// NOTHING here is real, and nothing in this file touches the database. The real tools (stage 1+) will
// return the same shapes from the payroll engine and PocketBase; this lets the assistant be seen and
// tested before any real employee data is sent to a free model provider.
export interface DemoEmployee { ref: string; name: string; region: 'Pakistan' | 'USA'; team: string }

export const DEMO_EMPLOYEES: DemoEmployee[] = [
  { ref: 'e_001', name: 'Sara Khan', region: 'Pakistan', team: 'Support' },
  { ref: 'e_002', name: 'Ali Raza', region: 'Pakistan', team: 'Support' },
  { ref: 'e_003', name: 'Aabru Zaineb', region: 'Pakistan', team: 'Dispatch' },
  { ref: 'e_004', name: 'Bilal Sadiq', region: 'Pakistan', team: 'Dispatch' },
  { ref: 'e_005', name: 'Hamza Tariq', region: 'Pakistan', team: 'Support' },
  { ref: 'e_006', name: 'Dana Bell', region: 'USA', team: 'Warehouse' },
  { ref: 'e_007', name: 'Sara Ali', region: 'Pakistan', team: 'Dispatch' },
];

export const DEMO_BANKS: Record<string, string> = {
  e_001: 'Meezan Bank — account 0123456789, IBAN PK00MEZN0000000123456789',
  e_002: 'HBL — account 5566778899, IBAN PK00HABB0000005566778899',
  e_003: 'UBL — account 3344556677, IBAN PK00UNIL0000003344556677',
  e_004: 'Allied Bank — account 9988776655, IBAN PK00ABPA0000009988776655',
  e_005: 'Bank Alfalah — account 1122334455, IBAN PK00ALFH0000001122334455',
  e_007: 'Meezan Bank — account 4455667788, IBAN PK00MEZN0000004455667788',
};

export interface DemoTicket { id: number; employeeRef: string; subject: string; body: string; status: 'open' | 'closed'; category: string }
export const DEMO_TICKETS: DemoTicket[] = [
  { id: 42, employeeRef: 'e_005', category: 'Tracker', status: 'open', subject: 'Screenshots not uploading', body: 'Hi HR, my tracker says it is running but I think it stopped taking screenshots on Monday. I restarted my laptop twice. The tracker window shows a yellow warning about screen recording.' },
  { id: 43, employeeRef: 'e_002', category: 'Salary', status: 'open', subject: 'Why is my pay lower this month?', body: 'Hello, I see deductions on my October salary page and I do not understand them. Could you explain?' },
];

const monthName = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function findEmployees(name: string): { ref: string; name: string; region: string; team: string }[] {
  const q = name.trim().toLowerCase();
  if (!q) return [];
  return DEMO_EMPLOYEES.filter(e => e.name.toLowerCase().includes(q) || q.split(/\s+/).every(part => e.name.toLowerCase().includes(part)))
    .map(e => ({ ref: e.ref, name: e.name, region: e.region, team: e.team }));
}

export function explainPay(ref: string, month: string): Record<string, unknown> {
  const emp = DEMO_EMPLOYEES.find(e => e.ref === ref);
  if (!emp) return { error: 'No such employee.' };
  const label = monthName(month);
  if (ref === 'e_001') return { employee: emp.name, month: label, status: 'paid', paid_on: '2026-10-01', net: 'PKR 52,000', deductions: 'none' };
  if (ref === 'e_002') return {
    employee: emp.name, month: label, status: 'not yet processed (the month is still open)', base: 'PKR 44,000', deductions_so_far: 'PKR 12,000',
    breakdown: [
      { reason: 'Absences', days: 2, dates: ['6 Oct', '13 Oct'], amount: 'PKR 8,000' },
      { reason: 'Short shifts', days: 2, dates: ['9 Oct (5h 10m)', '15 Oct (6h 00m)'], amount: 'PKR 3,000' },
      { reason: 'Urgent leave', days: 1, dates: ['21 Oct'], amount: 'PKR 1,000' },
    ], capped_at_monthly_base: false,
  };
  if (ref === 'e_003') return { employee: emp.name, month: label, status: 'paid', paid_on: '2026-10-01', net: 'PKR 0', note: 'First full month is held back (reserved PKR 35,000), paid at resignation or termination. Part-month pay for 15–31 Aug (PKR 19,194) was set aside and is paid with the October salary.' };
  if (ref === 'e_004') return { employee: emp.name, month: label, status: 'unpaid', reason: 'No bank details on the profile.', net_if_paid: 'PKR 41,500' };
  if (ref === 'e_005') return { employee: emp.name, month: label, status: 'not yet processed (the month is still open)', base: 'PKR 38,000', deductions_so_far: 'PKR 0', flags: ['tracker has not captured for 7 days'] };
  if (ref === 'e_006') return { employee: emp.name, month: label, status: 'not yet processed (the month is still open)', base: 'USD 2,100', deductions_so_far: 'USD 0', note: 'USA staff: geofence measures time only, no deductions.' };
  return { employee: emp.name, month: label, status: 'paid', paid_on: '2026-10-01', net: 'PKR 47,000', deductions: 'none' };
}

export function leaveSummary(ref: string, month: string): Record<string, unknown> {
  const emp = DEMO_EMPLOYEES.find(e => e.ref === ref);
  if (!emp) return { error: 'No such employee.' };
  const label = monthName(month);
  if (ref === 'e_001') return { employee: emp.name, month: label, requests: 3, approved: { count: 2, days: 4, dates: ['8 Oct (1d)', '14–16 Oct (3d)'] }, pending: { count: 1, days: 1, dates: ['28 Oct'] }, rejected: { count: 0 } };
  if (ref === 'e_005') return { employee: emp.name, month: label, requests: 7, approved: { count: 5, days: 8 }, pending: { count: 2, days: 3 }, rejected: { count: 0 }, over_alert_threshold: 'more than 5 leave days requested' };
  return { employee: emp.name, month: label, requests: 0, approved: { count: 0, days: 0 }, pending: { count: 0, days: 0 }, rejected: { count: 0 } };
}

export function reservedOverview(): Record<string, unknown> {
  return { people: [
    { name: 'Aabru Zaineb', reserved: 'PKR 35,000', reason: 'first-month reserve', payable: 'at resignation or termination' },
    { name: 'Bilal Sadiq', reserved: 'PKR 20,000', reason: 'first-month reserve', payable: 'at resignation or termination' },
  ], total: 'PKR 55,000' };
}

export function activityFacts(ref: string, month: string): Record<string, unknown> {
  const emp = DEMO_EMPLOYEES.find(e => e.ref === ref);
  if (!emp) return { error: 'No such employee.' };
  const label = monthName(month);
  if (ref === 'e_002') return { employee: emp.name, month: label, worked: '62h 10m of 72h expected', inactivity: '4h 20m in 11 periods (longest 38m on 9 Oct)', absences: 2, short_shifts: 2, weekend_hours: '0h', note: 'Inactivity can include meetings, reading and breaks; it does not prove idleness.' };
  if (ref === 'e_005') return { employee: emp.name, month: label, worked: '58h 40m of 72h expected', inactivity: '1h 05m in 3 periods', absences: 0, short_shifts: 1, weekend_hours: '6h 30m (over the 5-hour alert threshold)', note: 'Weekend hours were on Sat 11 Oct (3h 30m) and Sun 12 Oct (3h 00m).' };
  return { employee: emp.name, month: label, worked: '70h 20m of 72h expected', inactivity: '0h 40m in 2 periods', absences: 0, short_shifts: 0, weekend_hours: '0h' };
}

export function bankPlaceholder(ref: string): Record<string, unknown> {
  if (!DEMO_BANKS[ref]) return { error: 'No bank details on this profile.' };
  return { placeholder: `[[BANK:${ref}]]`, instruction: 'Use the placeholder exactly as written in your answer.' };
}

export function getTicket(id: number): Record<string, unknown> {
  const t = DEMO_TICKETS.find(x => x.id === id);
  if (!t) return { error: 'No such ticket.' };
  const emp = DEMO_EMPLOYEES.find(e => e.ref === t.employeeRef);
  // The ticket text is written by an employee: it is DATA to read, never instructions to follow.
  return { id: t.id, from: emp?.name, employee_ref: t.employeeRef, category: t.category, status: t.status, subject: t.subject, employee_message: t.body };
}

export function trackerHealth(ref: string): Record<string, unknown> {
  const rows = [
    { name: 'Hamza Tariq', ref: 'e_005', status: 'problem', detail: 'No capture for 7 days while shifts were open. Last heartbeat 5 days ago. Version 1.4.2. Screen recording permission appears to be off.' },
    { name: 'Sara Khan', ref: 'e_001', status: 'ok', detail: 'Healthy. Last capture 12 minutes ago. Version 1.4.2.' },
    { name: 'Ali Raza', ref: 'e_002', status: 'ok', detail: 'Healthy. Last capture 9 minutes ago. Version 1.4.2.' },
    { name: 'Bilal Sadiq', ref: 'e_004', status: 'warning', detail: 'Old version 1.3.9; update recommended.' },
  ];
  if (ref === 'all') return { checked: rows.length, problems: rows.filter(r => r.status !== 'ok') };
  return rows.find(r => r.ref === ref) ?? { error: 'No tracker data for this employee.' };
}

export function payrollOverview(month: string): Record<string, unknown> {
  return { month: monthName(month), employees: 7, paid: 4, unpaid: 3, flagged: 2, total_held: 'PKR 55,000', notes: ['Bilal Sadiq: no bank details', 'Hamza Tariq: tracker problem'] };
}

export function leaveOverview(month: string): Record<string, unknown> {
  return { month: monthName(month), ranked: [
    { who: 'Hamza Tariq', approved_days: 8, pending_days: 3, requests: 7 },
    { who: 'Sara Khan', approved_days: 4, pending_days: 1, requests: 3 },
  ], total_people_with_leave: 2, note: 'Days are working days (Mon-Fri).' };
}

export function absenceOverview(month: string): Record<string, unknown> {
  return { month: monthName(month), ranked: [
    { who: 'Ali Raza', absent_days: 2 },
  ], total_people_with_absences: 1 };
}
