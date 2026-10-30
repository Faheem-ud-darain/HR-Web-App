import { describe, it, expect } from 'vitest';
import { canSeeTicket, fetchesEveryTicket, ticketQuery, type TicketViewer } from './ticketVisibility';

const viewer = (role: string, over: Partial<TicketViewer> = {}): TicketViewer => ({ role, email: 'Me@x.us', technical: false, ...over });
const t = (employeeEmail: string, department: string) => ({ employeeEmail, department });
const mine = t('me@x.us', 'hr');
const someoneElsesHr = t('other@x.us', 'hr');
const someoneElsesTech = t('other@x.us', 'technical');

describe('canSeeTicket', () => {
  it('lets Admin see every ticket', () => {
    for (const x of [mine, someoneElsesHr, someoneElsesTech]) expect(canSeeTicket(viewer('admin'), x)).toBe(true);
  });
  it('lets HR see the HR department\'s tickets only', () => {
    expect(canSeeTicket(viewer('hr'), someoneElsesHr)).toBe(true);
    expect(canSeeTicket(viewer('hr'), someoneElsesTech)).toBe(false);
  });
  it('lets an employee see their own tickets and nobody else\'s, ignoring letter case', () => {
    expect(canSeeTicket(viewer('employee'), mine)).toBe(true);
    expect(canSeeTicket(viewer('employee'), t('ME@X.US', 'technical'))).toBe(true);
    expect(canSeeTicket(viewer('employee'), someoneElsesHr)).toBe(false);
    expect(canSeeTicket(viewer('employee'), someoneElsesTech)).toBe(false);
  });
  it('adds the technical queue for a Technical Support team member, but not other departments', () => {
    const tech = viewer('team_lead', { technical: true });
    expect(canSeeTicket(tech, someoneElsesTech)).toBe(true);
    expect(canSeeTicket(tech, someoneElsesHr)).toBe(false);
  });
  it('does not match another address that merely contains this one', () => {
    expect(canSeeTicket(viewer('employee', { email: 'me@x.us' }), t('someone.me@x.us.uk', 'hr'))).toBe(false);
  });
});

describe('what each person asks the database for', () => {
  it('has HR and Admin download everything', () => {
    expect(fetchesEveryTicket(viewer('hr'))).toBe(true);
    expect(fetchesEveryTicket(viewer('admin'))).toBe(true);
    expect(ticketQuery(viewer('hr'))).toBeNull();
  });
  it('has everyone else ask for their own, plus the technical queue for that team', () => {
    expect(ticketQuery(viewer('employee'))).toEqual({ ownEmail: 'me@x.us', includeTechnical: false });
    expect(ticketQuery(viewer('employee', { technical: true }))).toEqual({ ownEmail: 'me@x.us', includeTechnical: true });
  });
});
