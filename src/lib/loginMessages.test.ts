import { describe, expect, it } from 'vitest';
import { loginFailureMessage } from './loginMessages';

describe('loginFailureMessage', () => {
  it('uses the login service\'s own message when it sent one', () => {
    expect(loginFailureMessage(401, { error: 'Invalid email or password.' })).toBe('Invalid email or password.');
    expect(loginFailureMessage(429, { error: 'Too many login attempts. Please try again in 9 minutes.' })).toMatch(/9 minutes/);
    expect(loginFailureMessage(403, { error: 'This account has been deactivated / offboarded.' })).toMatch(/offboarded/);
  });
  it('says wrong password only for a real 401', () => {
    expect(loginFailureMessage(401, null)).toBe('Invalid email or password.');
  });
  it('never calls a server or gateway failure a wrong password', () => {
    for (const status of [500, 502, 503, 504, 522]) {
      const m = loginFailureMessage(status, null);
      expect(m).not.toMatch(/Invalid email or password/);
      expect(m).toMatch(new RegExp(String(status)));
    }
  });
  it('handles other statuses without blaming the password', () => {
    expect(loginFailureMessage(404, null)).toMatch(/404/);
    expect(loginFailureMessage(429, null)).toMatch(/wait/i);
  });
});
