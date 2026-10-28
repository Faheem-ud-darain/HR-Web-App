import type { Announcement, CareerPosition, LeaveApplication, PayrollRecord, Profile, Task, Team, Ticket, Warehouse } from '../hr/types';

// The top bar's global search: what each role may find. Every entity is scoped to exactly what that role has a
// sidebar page for, so a result never links somewhere the signed-in role could not otherwise reach.

export interface SearchViewer {
  role: string;
  email: string | null;
  // PayrollRecord.employeeId matches Profile.id, not the email.
  profileId: string | null;
  // LeaveApplication stores only a name snapshot, so leaves are matched to a person by name.
  displayName: string;
  // Member of the Technical Support team (sees the technical tickets).
  isTechnical: boolean;
}

export interface SearchData {
  profiles?: Profile[]; tasks?: Task[]; tickets?: Ticket[]; teams?: Team[]; warehouses?: Warehouse[];
  payroll?: PayrollRecord[]; leaves?: LeaveApplication[]; careers?: CareerPosition[]; announcements?: Announcement[];
}

export interface SearchResults {
  employees: Profile[]; tasks: Task[]; tickets: Ticket[]; teams: Team[]; warehouses: Warehouse[];
  payroll: PayrollRecord[]; leaves: LeaveApplication[]; careers: CareerPosition[]; announcements: Announcement[];
}

export const EMPTY_RESULTS: SearchResults = {
  employees: [], tasks: [], tickets: [], teams: [], warehouses: [], payroll: [], leaves: [], careers: [], announcements: [],
};

export const hasAnyResult = (r: SearchResults): boolean => Object.values(r).some(list => list.length > 0);

export function searchEverything(query: string, viewer: SearchViewer, data: SearchData): SearchResults {
  if (!query.trim() || !viewer.role) return EMPTY_RESULTS;
  const q = query.toLowerCase();
  const { role, profileId, displayName } = viewer;
  const mine = (viewer.email || '').toLowerCase();
  const privileged = role === 'hr' || role === 'admin';
  const has = (...texts: (string | undefined)[]) => texts.some(t => (t || '').toLowerCase().includes(q));

  // Tickets: HR sees HR tickets, Admin sees all, Technical Support sees technical tickets plus their own,
  // everyone else only their own.
  let tickets = data.tickets || [];
  if (role === 'hr') tickets = tickets.filter(t => t.department === 'hr');
  else if (role !== 'admin') {
    tickets = tickets.filter(t => t.employeeEmail.toLowerCase() === mine || (viewer.isTechnical && t.department === 'technical'));
  }

  // Payroll and leaves: the full ledger for HR/Admin, only my own otherwise.
  const payroll = privileged ? data.payroll || [] : profileId ? (data.payroll || []).filter(p => p.employeeId === profileId) : [];
  const leaves = privileged ? data.leaves || [] : displayName ? (data.leaves || []).filter(l => l.employeeName === displayName) : [];

  return {
    // Employees: the staff directory is HR/Admin only.
    employees: privileged ? (data.profiles || []).filter(e => has(e.fullName, e.email, e.jobTitle)) : [],
    tasks: (privileged ? data.tasks || [] : (data.tasks || []).filter(t => t.assignedEmail === viewer.email)).filter(t => has(t.title, t.description)),
    tickets: tickets.filter(t => has(t.title, t.description)),
    // Team Management lives under /hr and Warehouses under /admin.
    teams: role === 'hr' ? (data.teams || []).filter(t => has(t.name)) : [],
    warehouses: role === 'admin' ? (data.warehouses || []).filter(w => has(w.name)) : [],
    payroll: payroll.filter(p => has(p.name, p.role)),
    leaves: leaves.filter(l => has(l.type, l.reason, l.status)),
    // The Career Board and the announcements overview exist for every role.
    careers: (data.careers || []).filter(c => has(c.title, c.department)),
    announcements: (data.announcements || []).filter(a => has(a.title, a.content)),
  };
}

// Where each result type opens, per role.
export function searchLinks(role: string | null) {
  const home = role === 'admin' ? '/admin' : role === 'hr' ? '/hr' : '/employee';
  return {
    home,
    employees: role === 'hr' ? '/hr/teams' : '/admin/payroll',
    tasks: `${home}/tasks`,
    tickets: `${home}/tickets`,
    teams: '/hr/teams',
    warehouses: '/admin/warehouses',
    payroll: role === 'admin' || role === 'hr' ? `${home}/payroll` : '/employee/salary',
    leaves: `${home}/leaves`,
    careers: `${home}/careers`,
  };
}
