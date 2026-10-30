import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSessionEmail, getSessionRole, getSessionToken, setSession } from './session';

const fakeStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), has: (k: string) => m.has(k) };
};
let local: ReturnType<typeof fakeStorage>, session: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  local = fakeStorage(); session = fakeStorage();
  (globalThis as unknown as { window: unknown }).window = { localStorage: local, sessionStorage: session, dispatchEvent: () => true };
});
afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

describe('setSession and "Remember me"', () => {
  it('keeps a remembered session in localStorage only', async () => {
    await setSession('Ann@DelCargo.us', 'employee', true, 'tok');
    expect(local.has('user_email')).toBe(true);
    expect(session.has('user_email')).toBe(false);
    expect([getSessionEmail(), getSessionRole(), getSessionToken()]).toEqual(['ann@delcargo.us', 'employee', 'tok']);
  });
  it('keeps a session that was not remembered in sessionStorage only, so closing the browser ends it', async () => {
    await setSession('ann@delcargo.us', 'employee', false, 'tok');
    expect(local.has('user_email')).toBe(false);
    expect(local.has('user_role')).toBe(false);
    expect(session.has('user_email')).toBe(true);
    expect(getSessionEmail()).toBe('ann@delcargo.us');
  });
  it('replaces an older remembered session when the next sign-in is not remembered', async () => {
    await setSession('old@delcargo.us', 'hr', true, 'a');
    await setSession('new@delcargo.us', 'employee', false, 'b');
    expect(local.has('user_email')).toBe(false);
    expect(getSessionEmail()).toBe('new@delcargo.us');
  });
});
