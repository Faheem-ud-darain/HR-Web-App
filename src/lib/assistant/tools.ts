// The assistant's tools: a FIXED list of read-only functions with typed arguments. The model can only
// pick a tool and fill simple arguments; it never writes queries. In this prototype every tool reads the
// made-up data in demoData.ts. Real tools (later stages) keep these names and return shapes.
import {
  findEmployees, explainPay, leaveSummary, reservedOverview, activityFacts, bankPlaceholder,
  getTicket, trackerHealth, payrollOverview, leaveOverview, absenceOverview, DEMO_BANKS,
} from './demoData';

export interface ToolDef { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }

const str = (description: string) => ({ type: 'string', description });

export const TOOL_DEFS: ToolDef[] = [
  { type: 'function', function: { name: 'find_employee', description: 'Find employees by name (partial ok). Returns candidates with a ref.', parameters: { type: 'object', properties: { name: str('Name or part of it') }, required: ['name'] } } },
  { type: 'function', function: { name: 'explain_pay', description: "Facts about one employee's pay for a month: paid status, base, deductions with dates, reserved or held amounts, flags.", parameters: { type: 'object', properties: { employee_ref: str('ref from find_employee'), month: str('YYYY-MM') }, required: ['employee_ref', 'month'] } } },
  { type: 'function', function: { name: 'leave_summary', description: "One employee's LEAVE requests in a month (planned time off): requested, approved, pending, rejected with days and dates. Absences are separate (see explain_pay or activity_facts).", parameters: { type: 'object', properties: { employee_ref: str('ref'), month: str('YYYY-MM') }, required: ['employee_ref', 'month'] } } },
  { type: 'function', function: { name: 'reserved_overview', description: 'Everyone with reserved or held salary and when it is payable.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'activity_facts', description: 'Measurable work facts for one employee in a month: hours worked vs expected, inactivity, absences, short shifts, weekend hours.', parameters: { type: 'object', properties: { employee_ref: str('ref'), month: str('YYYY-MM') }, required: ['employee_ref', 'month'] } } },
  { type: 'function', function: { name: 'bank_details', description: 'Bank details for an employee. Returns a placeholder to use verbatim in the answer.', parameters: { type: 'object', properties: { employee_ref: str('ref') }, required: ['employee_ref'] } } },
  { type: 'function', function: { name: 'get_ticket', description: 'Read one support ticket by number.', parameters: { type: 'object', properties: { ticket_id: { type: 'integer' } }, required: ['ticket_id'] } } },
  { type: 'function', function: { name: 'tracker_health', description: "Tracker status for one employee, or 'all' for everyone with a problem.", parameters: { type: 'object', properties: { employee_ref: str("ref, or 'all'") }, required: ['employee_ref'] } } },
  { type: 'function', function: { name: 'suggest_actions', description: 'Show up to 3 buttons under your answer. open_page opens a page (optionally searching for a name); ask_followup asks a short follow-up question when clicked. Buttons only open pages or ask questions. Call it last, only when a clear next step exists.', parameters: { type: 'object', properties: { actions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['open_page', 'ask_followup'] }, label: { type: 'string', description: 'Button text, max 40 chars' }, page: { type: 'string', description: 'payroll, leaves, absences, tickets, tracking, tasks, careers, reports, team-chats, policy, teams, onboarding, insights, warehouses' }, search: { type: 'string', description: 'Optional employee name to search for on that page' }, text: { type: 'string', description: 'For ask_followup: the question to ask' } }, required: ['type', 'label'] } } }, required: ['actions'] } } },
  { type: 'function', function: { name: 'activity_now', description: 'Whether ONE employee is active right now: clocked in on an open shift (since when), tracker connected, and when their last shift ended. Use for "is X active / online / working / on shift right now". Tolerates a slightly misspelt name.', parameters: { type: 'object', properties: { employee_ref: str('ref from find_employee, or the name as typed') }, required: ['employee_ref'] } } },
  { type: 'function', function: { name: 'active_now', description: 'Everyone who is clocked in on an open shift right now, with how long and whether their tracker is connected. Use for "who is active / online / working right now".', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'leave_overview', description: 'Company-wide LEAVE (planned time off that was requested: PTO, sick, urgent, normal, parental), ranked, with approved and pending working days. Use for "who took the most leave / time off / holiday". NOT for absences.', parameters: { type: 'object', properties: { month: str('YYYY-MM') }, required: ['month'] } } },
  { type: 'function', function: { name: 'absence_overview', description: 'Company-wide ABSENCES (unplanned: no clock-in, under 4 hours worked, or inactivity auto-stop), ranked by absent days. Use for "who was absent / did not come in / no-show". NOT for approved leave.', parameters: { type: 'object', properties: { month: str('YYYY-MM') }, required: ['month'] } } },
  { type: 'function', function: { name: 'payroll_overview', description: 'Company-wide payroll status for a month: paid, unpaid, flagged, held.', parameters: { type: 'object', properties: { month: str('YYYY-MM') }, required: ['month'] } } },
];

// ── Suggested actions (inline buttons) ──────────────────────────────────────
// The model may only SUGGEST buttons. They are validated here against a fixed list, and a click is run by
// the app as the signed-in person: it opens a page or asks a follow-up question. The assistant itself can
// still change nothing. (Anything that would change data would go through the app's own confirm flows.)
export type AssistantRole = 'hr' | 'admin';
export interface AssistantAction { type: 'open_page' | 'ask_followup'; label: string; page?: string; search?: string; text?: string }

const COMMON_PAGES = ['payroll', 'leaves', 'absences', 'tickets', 'tracking', 'tasks', 'careers', 'reports', 'team-chats', 'policy'];
export const ACTION_PAGES: Record<AssistantRole, string[]> = {
  hr: [...COMMON_PAGES, 'teams', 'onboarding'],
  admin: [...COMMON_PAGES, 'insights', 'warehouses'],
};
const MAX_ACTIONS = 3;
const ADDRESSED_TO_SOMEONE = /\byour\b|\byou(?:'re| are| see| have|'ve| share| send| provide| confirm)\b|\bplease\b|\bthanks?\b/i;

const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Keeps only well-formed, allow-listed actions (at most three); anything else is dropped. */
export function normalizeActions(raw: unknown, role: AssistantRole): AssistantAction[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistantAction[] = [];
  for (const item of raw) {
    if (out.length >= MAX_ACTIONS || !item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    const label = clean(a.label, 40);
    if (!label) continue;
    if (a.type === 'open_page') {
      const page = clean(a.page, 30);
      if (!ACTION_PAGES[role].includes(page)) continue;
      const search = clean(a.search, 60);
      out.push({ type: 'open_page', label, page, ...(search ? { search } : {}) });
    } else if (a.type === 'ask_followup') {
      const text = clean(a.text, 140);
      // A follow-up is a question the HR/Admin user asks the assistant. Wording addressed to someone else
      // (for example "Can you share a screenshot of your screen?" meant for the employee) is dropped.
      if (text && !ADDRESSED_TO_SOMEONE.test(text)) out.push({ type: 'ask_followup', label, text });
    }
  }
  return out;
}

/**
 * Sensible default buttons from what the tools returned, used when the model offered none. Built in code
 * so the common cases are always consistent (open the page that goes with the answer).
 */
export function defaultActions(calls: { name: string; result: Record<string, unknown> }[], role: AssistantRole): AssistantAction[] {
  const who = (r: Record<string, unknown>) => (typeof r.employee === 'string' ? r.employee : typeof r.from === 'string' ? r.from : '');
  const last = [...calls].reverse().find(c => ['explain_pay', 'leave_summary', 'get_ticket', 'tracker_health', 'reserved_overview', 'payroll_overview', 'activity_facts', 'leave_overview', 'absence_overview'].includes(c.name));
  if (!last) return [];
  const name = who(last.result);
  const raw: unknown[] = [];
  switch (last.name) {
    case 'explain_pay': raw.push({ type: 'open_page', label: name ? `Open payroll for ${name}` : 'Open payroll', page: 'payroll', search: name }); break;
    case 'reserved_overview': case 'payroll_overview': raw.push({ type: 'open_page', label: 'Open payroll', page: 'payroll' }); break;
    case 'leave_summary': raw.push({ type: 'open_page', label: name ? `Open leaves for ${name}` : 'Open leaves', page: 'leaves', search: name }); break;
    case 'tracker_health': raw.push({ type: 'open_page', label: 'Open tracking', page: 'tracking' }); break;
    case 'leave_overview': raw.push({ type: 'open_page', label: 'Open leave management', page: 'leaves' }); break;
    case 'absence_overview': raw.push({ type: 'open_page', label: 'Open absences', page: 'absences' }); break;
    case 'get_ticket':
      raw.push({ type: 'open_page', label: 'Open tickets', page: 'tickets' });
      if (name) raw.push({ type: 'ask_followup', label: `Check ${name}'s tracker`, text: `Check the tracker health for ${name}` });
      break;
    case 'activity_facts': if (name) raw.push({ type: 'ask_followup', label: `${name}'s pay this month`, text: `Why does ${name} have deductions this month?` }); break;
  }
  return normalizeActions(raw, role);
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const REF = /^[a-z0-9_]{1,20}$/i;

export function isToolName(name: string): boolean {
  return TOOL_DEFS.some(t => t.function.name === name);
}

/** Runs one tool. Arguments are validated here; anything odd gets a plain error the model can read. */
export function runTool(name: string, args: Record<string, unknown>): Record<string, unknown> {
  const ref = typeof args.employee_ref === 'string' ? args.employee_ref : '';
  const month = typeof args.month === 'string' ? args.month : '';
  switch (name) {
    case 'find_employee': return { candidates: findEmployees(typeof args.name === 'string' ? args.name.slice(0, 60) : '') };
    case 'explain_pay': return MONTH.test(month) && REF.test(ref) ? explainPay(ref, month) : { error: 'Need employee_ref and month as YYYY-MM.' };
    case 'leave_summary': return MONTH.test(month) && REF.test(ref) ? leaveSummary(ref, month) : { error: 'Need employee_ref and month as YYYY-MM.' };
    case 'reserved_overview': return reservedOverview();
    case 'activity_facts': return MONTH.test(month) && REF.test(ref) ? activityFacts(ref, month) : { error: 'Need employee_ref and month as YYYY-MM.' };
    case 'bank_details': return REF.test(ref) ? bankPlaceholder(ref) : { error: 'Need employee_ref.' };
    case 'get_ticket': return Number.isInteger(args.ticket_id) ? getTicket(args.ticket_id as number) : { error: 'Need a ticket number.' };
    case 'tracker_health': return REF.test(ref) || ref === 'all' ? trackerHealth(ref) : { error: 'Need employee_ref or all.' };
    case 'payroll_overview': return MONTH.test(month) ? payrollOverview(month) : { error: 'Need month as YYYY-MM.' };
    case 'activity_now': return { employee: 'Ali Raza', on_shift_now: true, shift_started: 'Mon 9:02 AM New York time', shift_length_so_far: '3h 10m', tracker_connected_now: true };
    case 'active_now': return { on_shift_now: 2, people: [{ who: 'Ali Raza', on_shift_for: '3h 10m', tracker: 'connected' }, { who: 'Sara Khan', on_shift_for: '1h 05m', tracker: 'connected' }] };
    case 'leave_overview': return MONTH.test(month) ? leaveOverview(month) : { error: 'Need month as YYYY-MM.' };
    case 'absence_overview': return MONTH.test(month) ? absenceOverview(month) : { error: 'Need month as YYYY-MM.' };
    default: return { error: 'Unknown tool.' };
  }
}

/**
 * Bank details never go to the model: it only ever sees `[[BANK:ref]]`. This swaps in the real value
 * AFTER the model has finished, on the server, just before the answer is shown to HR/Admin.
 */
export function mergeBankPlaceholders(answer: string): string {
  return answer.replace(/\[\[BANK:([a-z0-9_]{1,20})\]\]/gi, (_m, ref: string) => DEMO_BANKS[ref] ?? '(no bank details on file)');
}
