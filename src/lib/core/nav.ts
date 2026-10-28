// The main navigation: which pages each role sees, how they are grouped, and the small rules around them (which link is active, which one can show an "unseen activity" dot). Pure data and
// logic so it is unit-tested; the icons are looked up by name in components/layout/sidebar/NavLink.tsx.

export type NavRole = 'admin' | 'hr' | 'employee' | 'team_lead';

export type NavIcon =
  | 'dashboard' | 'hrAdmin' | 'tickets' | 'teamChat' | 'directMessages' | 'assistant' | 'tasks' | 'warehouses' | 'careers'
  | 'leaves' | 'attendance' | 'payroll' | 'reports' | 'insights' | 'tracking' | 'onboarding' | 'teams' | 'tracker' | 'teamTasks' | 'policy';

export type DotKey = 'tickets' | 'chat' | 'hrAdmin';

export interface NavItem { name: string; href: string; icon: NavIcon }
export interface NavGroup { title: string | null; items: NavItem[] }

export interface NavFlags {
  /** Screen tracking is on for this employee, so they get the Timesheet Tracker page. */
  trackingEnabled?: boolean;
  /** Leads a team, so they get Team Tasks. */
  isTeamLead?: boolean;
}

const item = (name: string, href: string, icon: NavIcon): NavItem => ({ name, href, icon });

/** The role's home page, which is also its URL prefix. */
export const navRoot = (role: NavRole): string => (role === 'admin' ? '/admin' : role === 'hr' ? '/hr' : '/employee');

export const policyItem = (role: NavRole): NavItem => item('Policy Handbook', `${navRoot(role)}/policy`, 'policy');

/** Every page the role can open, in groups. The first group is the home page on its own. */
export function navGroups(role: NavRole, { trackingEnabled = false, isTeamLead = false }: NavFlags = {}): NavGroup[] {
  const r = navRoot(role);
  if (role === 'admin') {
    return [
      { title: null, items: [item('Overview', r, 'dashboard')] },
      { title: 'Communicate', items: [item('HR & Admin', `${r}/hr-admin`, 'hrAdmin'), item('Support Tickets', `${r}/tickets`, 'tickets'), item('Team Chats', `${r}/team-chats`, 'teamChat'), item('Direct Messages', `${r}/direct-messages`, 'directMessages'), item('Del Assistant', `${r}/assistant`, 'assistant')] },
      { title: 'Work', items: [item('Tasks', `${r}/tasks`, 'tasks'), item('Warehouses', `${r}/warehouses`, 'warehouses'), item('Career Board', `${r}/careers`, 'careers')] },
      { title: 'People & pay', items: [item('Leaves Approval', `${r}/leaves`, 'leaves'), item('Attendance', `${r}/absences`, 'attendance'), item('Payroll & Salary', `${r}/payroll`, 'payroll')] },
      { title: 'Insights', items: [item('Master Reports', `${r}/reports`, 'reports'), item('Insights', `${r}/insights`, 'insights'), item('Screen Tracking', `${r}/tracking`, 'tracking')] },
    ];
  }
  if (role === 'hr') {
    return [
      { title: null, items: [item('HR Dashboard', r, 'dashboard')] },
      { title: 'Communicate', items: [item('HR & Admin', `${r}/hr-admin`, 'hrAdmin'), item('Support Tickets', `${r}/tickets`, 'tickets'), item('Team Chats', `${r}/team-chats`, 'teamChat'), item('Direct Messages', `${r}/direct-messages`, 'directMessages'), item('Del Assistant', `${r}/assistant`, 'assistant')] },
      { title: 'Work', items: [item('Task Management', `${r}/tasks`, 'tasks'), item('Onboarding', `${r}/onboarding`, 'onboarding'), item('Team Management', `${r}/teams`, 'teams'), item('Career Board', `${r}/careers`, 'careers')] },
      { title: 'People & pay', items: [item('Leave Management', `${r}/leaves`, 'leaves'), item('Attendance', `${r}/absences`, 'attendance'), item('Payroll Records', `${r}/payroll`, 'payroll')] },
      { title: 'Insights', items: [item('Master Reports', `${r}/reports`, 'reports'), item('Screen Tracking', `${r}/tracking`, 'tracking')] },
    ];
  }
  return [
    { title: null, items: [item('My Dashboard', r, 'dashboard')] },
    { title: 'My work', items: [
      ...(trackingEnabled ? [item('Timesheet Tracker', `${r}/tracker`, 'tracker')] : []),
      item('My Leaves', `${r}/leaves`, 'leaves'), item('Attendance', `${r}/absences`, 'attendance'), item('Salary', `${r}/salary`, 'payroll'), item('Career Board', `${r}/careers`, 'careers'),
      ...(isTeamLead ? [item('Team Tasks', `${r}/tasks`, 'teamTasks')] : []),
    ] },
    { title: 'Communicate', items: [item('Support Tickets', `${r}/tickets`, 'tickets'), item('Team Chat', `${r}/chat`, 'teamChat'), item('HR Messages', `${r}/direct-messages`, 'directMessages')] },
  ];
}

/** A page is current on its own address and on anything below it; a home page only on its exact address. */
export function isNavActive(pathname: string | null | undefined, href: string, role: NavRole): boolean {
  const path = pathname || '';
  return href === navRoot(role) ? path === href : path === href || path.startsWith(`${href}/`);
}

/** Which "unseen activity" dot, if any, belongs on this link. */
export function navDotKey(href: string): DotKey | null {
  if (href.endsWith('/tickets')) return 'tickets';
  if (href.endsWith('/chat') || href.endsWith('/team-chats')) return 'chat';
  if (href.endsWith('/hr-admin')) return 'hrAdmin';
  return null;
}
