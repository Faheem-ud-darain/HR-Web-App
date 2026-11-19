import { SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => { process.env.SESSION_JWT_SECRET = 'test-secret-test-secret-test-secret-123'; });
const secret = () => new TextEncoder().encode(process.env.SESSION_JWT_SECRET);

describe('Google link state', () => {
  it('a state signed for a person verifies to that person\'s email', async () => {
    const { signGoogleLinkState, verifyGoogleLinkState } = await import('./serverAuth');
    expect(await verifyGoogleLinkState(await signGoogleLinkState('ali@x.us'))).toBe('ali@x.us');
  });

  it('the old plain {"email": ...} state, and anything unsigned or tampered with, is refused', async () => {
    const { signGoogleLinkState, verifyGoogleLinkState } = await import('./serverAuth');
    expect(await verifyGoogleLinkState(JSON.stringify({ email: 'victim@x.us' }))).toBeNull();
    expect(await verifyGoogleLinkState(encodeURIComponent(JSON.stringify({ email: 'victim@x.us' })))).toBeNull();
    const good = await signGoogleLinkState('ali@x.us');
    expect(await verifyGoogleLinkState(good.slice(0, -4) + 'AAAA')).toBeNull();
    expect(await verifyGoogleLinkState('')).toBeNull();
    expect(await verifyGoogleLinkState(null)).toBeNull();
  });

  it('a state signed with another secret is refused', async () => {
    const { verifyGoogleLinkState } = await import('./serverAuth');
    const forged = await new SignJWT({ email: 'victim@x.us', purpose: 'google_link' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('10m').sign(new TextEncoder().encode('another-secret-another-secret-12345678'));
    expect(await verifyGoogleLinkState(forged)).toBeNull();
  });

  it('an expired state is refused', async () => {
    const { verifyGoogleLinkState } = await import('./serverAuth');
    const old = await new SignJWT({ email: 'ali@x.us', purpose: 'google_link' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(secret());
    expect(await verifyGoogleLinkState(old)).toBeNull();
  });

  it('a session token cannot be used as a link state, and a link state cannot be used as a session token', async () => {
    const { signSessionToken, signGoogleLinkState, verifyGoogleLinkState, verifySessionToken } = await import('./serverAuth');
    expect(await verifyGoogleLinkState(await signSessionToken({ email: 'ali@x.us', role: 'employee' }))).toBeNull();
    expect(await verifySessionToken(await signGoogleLinkState('ali@x.us'))).toBeNull();
  });
});
