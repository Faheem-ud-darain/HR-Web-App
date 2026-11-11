import { describe, expect, it } from 'vitest';
import { ageText, findEarlierAnswer, normaliseQuestion, type ChatLine } from './repeatQuestion';

const q = (id: string, content: string, extra: Partial<ChatLine> = {}): ChatLine => ({ id, role: 'user', content, ...extra });
const a = (id: string, content: string, extra: Partial<ChatLine> = {}): ChatLine => ({ id, role: 'assistant', content, toolsUsed: ['list_tickets'], ...extra });

describe('the same question asked again in a chat', () => {
  const chat = [q('q1', 'Which tickets are open longer than 3 days?'), a('a1', 'Six tickets.'), q('q2', 'And who is on shift now?'), a('a2', 'Eleven people.', { toolsUsed: ['active_now'] })];
  it('ignores case, punctuation and spacing', () => {
    expect(normaliseQuestion('  Which TICKETS are open   longer than 3 days??')).toBe('which tickets are open longer than 3 days');
    expect(findEarlierAnswer(chat, 'which tickets are open longer than 3 days')?.answer.id).toBe('a1');
    expect(findEarlierAnswer(chat, 'AND who is on shift now')?.answer.id).toBe('a2');
  });
  it('is not fooled by a different question', () => {
    expect(findEarlierAnswer(chat, 'Which tickets are open longer than 5 days?')).toBeNull();
  });
  it('only points to answers that were worked out from the data, never to an error or a greeting', () => {
    expect(findEarlierAnswer([q('q', 'hello there friend'), a('a', 'Good day.', { toolsUsed: [] })], 'hello there friend')).toBeNull();
    expect(findEarlierAnswer([q('q', 'which trackers have problems'), a('a', 'busy', { error: true })], 'which trackers have problems')).toBeNull();
    expect(findEarlierAnswer([q('q', 'x'), a('a', 'y')], 'x')).toBeNull(); // too short to be a real question
  });
  it('points to the newest earlier answer, and not to a note that itself pointed to one', () => {
    const again = [...chat, q('q3', 'Which tickets are open longer than 3 days?', { repeatOf: 'a1' }), a('a3', 'You asked this earlier', { repeatOf: 'a1', toolsUsed: [] }), q('q4', 'Which tickets are open longer than 3 days?'), a('a4', 'Seven tickets now.')];
    expect(findEarlierAnswer(again, 'which tickets are open longer than 3 days')?.answer.id).toBe('a4');
    expect(findEarlierAnswer([...chat, q('q3', 'which tickets are open longer than 3 days', { repeatOf: 'a1' }), a('a3', 'note', { repeatOf: 'a1' })], 'Which tickets are open longer than 3 days?')?.answer.id).toBe('a1');
  });
});

describe('how long ago', () => {
  const now = 1_700_000_000_000;
  it('says it in plain words', () => {
    expect(ageText(now - 20_000, now)).toBe('just now');
    expect(ageText(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(ageText(now - 61 * 60_000, now)).toBe('1 hour ago');
    expect(ageText(now - 3 * 3600_000, now)).toBe('3 hours ago');
    expect(ageText(undefined, now)).toBe('');
  });
});
