import type { ToolDef } from './tools';

// Del used to send all of its tools with every request, about 1,900 tokens each time, and the model is asked again after every tool it
// calls. Most questions need two to four tools, so the question is read here, in plain code and for free, and only the tools (and the
// background notes) for what was asked go to the model. When the question is unclear, or touches many things, everything is sent as before.
export type Topic = 'pay' | 'leave' | 'attendance' | 'tracker' | 'tickets' | 'bank' | 'now';

const PATTERNS: Record<Topic, RegExp> = {
  pay: /\b(pay|paid|salary|salaries|payroll|deduct\w*|bonus|increment|slip|reserved|held|net)\b/i,
  leave: /\b(leave|leaves|pto|sick|vacation|holiday|days? off|balance)\b/i,
  attendance: /\b(absent|absence|absences|attendance|clock\w*|shifts?|worked|hours|late|inactiv\w*|idle|short)\b/i,
  tracker: /\b(trackers?|screenshots?|captures?|agent|extension|chromebook|heartbeat)\b/i,
  tickets: /\b(tickets?|repl(?:y|ied|ies)|support|complaints?)\b/i,
  bank: /\b(bank|account number|iban)\b/i,
  now: /\b(right now|currently|online|active now|working now|who is working|who's working)\b/i,
};

export const TOPIC_TOOLS: Record<Topic, string[]> = {
  pay: ['explain_pay', 'payroll_overview', 'reserved_overview', 'activity_facts'],
  leave: ['leave_summary', 'leave_overview', 'leave_balance'],
  attendance: ['absence_overview', 'absence_details', 'attendance_day', 'activity_facts', 'activity_now'],
  tracker: ['tracker_health', 'activity_now'],
  tickets: ['list_tickets', 'get_ticket', 'ticket_trail'],
  bank: ['bank_details'],
  now: ['active_now', 'activity_now'],
};
const ALWAYS = ['find_employee']; // looking a person up is needed by almost every question and costs little
const MOST_TOPICS = 3; // a question touching more than this is a broad one: send everything

export const topicsOf = (text: string): Topic[] => (Object.keys(PATTERNS) as Topic[]).filter(t => PATTERNS[t].test(text));

/**
 * The tools and background notes a question needs. `null` topics means "everything": nothing recognised (a follow-up such as "and her?"
 * reads the question before it), too many things at once, or a ticket reply to draft, which needs pay, leave and tracker facts.
 */
export function routeTools(defs: ToolDef[], userMessages: string[]): { defs: ToolDef[]; topics: Topic[] | null } {
  const latest = userMessages[userMessages.length - 1] || '';
  if (/\bdraft\b/i.test(latest)) return { defs, topics: null };
  let topics = topicsOf(latest);
  if (!topics.length && userMessages.length > 1) topics = topicsOf(userMessages[userMessages.length - 2]);
  if (!topics.length || topics.length > MOST_TOPICS) return { defs, topics: null };
  const wanted = new Set([...ALWAYS, ...topics.flatMap(t => TOPIC_TOOLS[t])]);
  return { defs: defs.filter(d => wanted.has(d.function.name)), topics };
}
