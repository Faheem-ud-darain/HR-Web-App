import { describe, expect, it } from 'vitest';
import { LIVE_DEFS } from './live';
import { routeTools, topicsOf } from './toolRouter';
import { systemPrompt } from './prompt';

const names = (q: string[]) => routeTools(LIVE_DEFS, q).defs.map(d => d.function.name);

describe('only the tools a question needs are sent', () => {
  it('reads the topic from the question', () => {
    expect(topicsOf('Who replied to the ticket and from where?')).toEqual(['tickets']);
    expect(topicsOf('Why was Emily marked absent on 9 November?')).toEqual(['attendance']);
    expect(topicsOf("What is Emily's PTO balance?")).toEqual(['leave']);
    expect(topicsOf('hello')).toEqual([]);
  });
  it('sends the ticket tools for a ticket question, plus the person lookup, and nothing about pay or trackers', () => {
    const sent = names(['Which tickets are open longer than 3 days?']);
    expect(sent).toEqual(expect.arrayContaining(['find_employee', 'list_tickets', 'get_ticket', 'ticket_trail']));
    expect(sent).not.toContain('explain_pay');
    expect(sent).not.toContain('tracker_health');
    expect(sent.length).toBeLessThan(LIVE_DEFS.length / 2);
  });
  it('sends everything when nothing is recognised, when the question is broad, or when a reply is to be drafted', () => {
    expect(names(['hello there'])).toHaveLength(LIVE_DEFS.length);
    expect(names(['pay, leave, absence and tracker status for everyone'])).toHaveLength(LIVE_DEFS.length);
    expect(names(['Draft a reply to this ticket'])).toHaveLength(LIVE_DEFS.length);
  });
  it('lets a follow-up with no keywords reuse the question before it', () => {
    expect(names(['Which tickets are waiting on HR?', 'and the older ones?'])).toContain('list_tickets');
  });
  it('sends only the background notes the topic needs, and all of them when unsure', () => {
    const tickets = systemPrompt(new Date(), true, 'hr', ['tickets']);
    expect(tickets).not.toMatch(/How DelCargo pay works/);
    expect(systemPrompt(new Date(), true, 'hr', ['pay'])).toMatch(/How DelCargo pay works/);
    expect(systemPrompt(new Date(), true, 'hr', ['pay'])).not.toMatch(/Tracker problems/);
    expect(systemPrompt(new Date(), true, 'hr', null)).toMatch(/Tracker problems/);
    expect(tickets.length).toBeLessThan(systemPrompt(new Date(), true, 'hr', null).length - 1500);
  });
});
