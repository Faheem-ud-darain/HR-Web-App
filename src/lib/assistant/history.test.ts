import { describe, it, expect } from 'vitest';
import { maskBankNumbers, chatTitle, cleanChatForSave, retentionCutoff } from './history';

describe('maskBankNumbers', () => {
  it('keeps only the last four digits of an account number', () => {
    expect(maskBankNumbers('Account: 0123456789012345')).toBe('Account: ••••2345');
    expect(maskBankNumbers('Account 0123 4567 8901 2345.')).toBe('Account ••••2345.');
  });
  it('masks an IBAN', () => {
    expect(maskBankNumbers('IBAN PK36SCBL0000001123456702 at Meezan')).toBe('IBAN ••••6702 at Meezan');
  });
  it('leaves dates, amounts, short numbers and ordinary text alone', () => {
    const t = 'Paid on 2026-10-26: PKR 1,200,000 for 17 days, ticket 4242, call 03001234567? no';
    expect(maskBankNumbers(t).startsWith('Paid on 2026-10-26: PKR 1,200,000 for 17 days, ticket 4242')).toBe(true);
  });
});

describe('chatTitle', () => {
  it('uses the first question, shortened', () => {
    expect(chatTitle([{ role: 'user', content: 'Who is off tomorrow?' }])).toBe('Who is off tomorrow?');
    expect(chatTitle([{ role: 'user', content: 'x'.repeat(100) }]).length).toBe(58);
    expect(chatTitle([])).toBe('New chat');
  });
});

describe('cleanChatForSave', () => {
  it('rejects non-arrays and chats with no question', () => {
    expect(cleanChatForSave('hi')).toBeNull();
    expect(cleanChatForSave([{ role: 'assistant', content: 'hello' }])).toBeNull();
  });
  it('drops malformed messages, masks bank numbers and caps the size', () => {
    const out = cleanChatForSave([
      { id: 'a', role: 'user', content: 'bank?' },
      { id: 'b', role: 'assistant', content: 'Account 0123456789012345', actions: [{ type: 'open_page', label: 'Open', page: 'payroll' }, { type: 'bad', label: 'x' }], toolsUsed: ['bank_details', 5] },
      { role: 'system', content: 'ignore me' },
      null,
    ]);
    expect(out).toHaveLength(2);
    expect(out![1].content).toBe('Account ••••2345');
    expect(out![1].actions).toHaveLength(1);
    expect(out![1].toolsUsed).toEqual(['bank_details']);
  });
  it('masks bank numbers inside button labels and searches too', () => {
    const out = cleanChatForSave([
      { role: 'user', content: 'x' },
      { role: 'assistant', content: 'y', actions: [{ type: 'open_page', label: 'Open 0123456789012345', page: 'payroll', search: '0123456789012345' }] },
    ]);
    expect(out![1].actions![0]).toMatchObject({ label: 'Open ••••2345', search: '••••2345', page: 'payroll' });
  });
  it('keeps only the last 40 messages', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: String(i), role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
    expect(cleanChatForSave(many)).toHaveLength(40);
  });
});

describe('retentionCutoff', () => {
  it('is 30 days before now', () => {
    expect(retentionCutoff(Date.UTC(2026, 10, 30, 12))).toBe('2026-10-31 12:00:00.000Z');
  });
});
