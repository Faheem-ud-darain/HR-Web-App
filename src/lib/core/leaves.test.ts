import { describe, expect, it } from 'vitest';
import { LEAVE_STATUS_MEANING, leaveProgress } from './leaves';

describe('leaveProgress', () => {
  const states = (status: Parameters<typeof leaveProgress>[0]) => leaveProgress(status).map(s => `${s.label}:${s.state}`);

  it('walks a leave from requested, to HR review, to CEO sign-off', () => {
    expect(states('pending')).toEqual(['Requested:done', 'HR review:current', 'CEO sign-off:todo']);
    expect(states('hr_approved')).toEqual(['Requested:done', 'HR review:done', 'CEO sign-off:current']);
    expect(states('approved')).toEqual(['Requested:done', 'HR review:done', 'CEO sign-off:done']);
  });

  it('a rejected leave ends at Rejected', () => {
    expect(states('rejected')).toEqual(['Requested:done', 'Rejected:stopped']);
  });

  it('says in plain words what every status means', () => {
    for (const status of ['pending', 'hr_approved', 'approved', 'rejected'] as const) expect(LEAVE_STATUS_MEANING[status].length).toBeGreaterThan(10);
  });
});
