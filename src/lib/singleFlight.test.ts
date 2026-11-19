import { describe, expect, it } from 'vitest';
import { singleFlight } from './singleFlight';

describe('singleFlight', () => {
  it('skips a call that arrives while another is running, so two quick location fixes cannot both clock in', async () => {
    const run = singleFlight();
    let started = 0;
    const slow = () => run(async () => { started++; await new Promise(r => setTimeout(r, 20)); return 'done'; });
    const [a, b] = await Promise.all([slow(), slow()]);
    expect(started).toBe(1);
    expect([a, b].filter(x => x === 'done')).toHaveLength(1);
  });
  it('lets the next call run once the first has finished, even if it threw', async () => {
    const run = singleFlight();
    await expect(run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await run(async () => 'again')).toBe('again');
  });
});
