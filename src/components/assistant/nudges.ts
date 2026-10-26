// Short, friendly prompts the closed assistant floats beside its orb now and then. Each is a question
// Del can answer from live data; clicking one opens the window and asks it. Months are worked out
// when the bubble appears, so "this month" and "next month" are never stale.
export interface Nudge { bubble: string; question: string }

const monthName = (offset: number): string => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1).toLocaleString('en-US', { month: 'long' });
};

export function nudgePool(): Nudge[] {
  const thisMonth = monthName(0);
  const nextMonth = monthName(1);
  const lastMonth = monthName(-1);
  return [
    { bubble: `Check the ${thisMonth} payroll?`, question: `Give me an overview of the ${thisMonth} payroll.` },
    { bubble: `Review ${lastMonth} salaries?`, question: `Were all ${lastMonth} salaries paid? Who is still pending?` },
    { bubble: 'Who is off tomorrow?', question: 'Who has approved leave tomorrow?' },
    { bubble: `Leave planned for ${nextMonth}?`, question: `How many leave days are booked for ${nextMonth}, and who is off?` },
    { bubble: 'Who is working right now?', question: 'Who is active right now?' },
    { bubble: 'Any tracker problems?', question: 'Are any trackers reporting errors or not sending a signal?' },
    { bubble: 'Open tickets to review?', question: 'Which tickets are still open and need a reply?' },
    { bubble: 'Who was off the most this month?', question: 'Who took the most leave and the most absences this month?' },
  ];
}
