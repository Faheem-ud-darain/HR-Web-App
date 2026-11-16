import { describe, expect, it } from 'vitest';
import { dashboardGate } from './dashboardGate';
import { describeProbe } from '../sessionProbe';

const base = { role: 'employee', dbReady: true, hasProfile: true, myProfileFetched: true, rosterLoading: false };

describe('dashboardGate', () => {
  it('opens once an employee has their profile', () => {
    expect(dashboardGate(base)).toBe('ready');
  });
  it('keeps loading while either source of the profile is still on its way', () => {
    expect(dashboardGate({ ...base, hasProfile: false, myProfileFetched: false })).toBe('loading');
    expect(dashboardGate({ ...base, hasProfile: false, rosterLoading: true })).toBe('loading');
    expect(dashboardGate({ ...base, hasProfile: true, dbReady: false })).toBe('loading');
    expect(dashboardGate({ ...base, role: null })).toBe('loading');
  });
  it('says the session was rejected when both sources finished and neither produced the profile (this used to load forever)', () => {
    expect(dashboardGate({ ...base, hasProfile: false })).toBe('session_rejected');
    expect(dashboardGate({ ...base, role: 'team_lead', hasProfile: false })).toBe('session_rejected');
  });
  it('HR and Admin need no profile of their own to open', () => {
    expect(dashboardGate({ ...base, role: 'hr', hasProfile: false })).toBe('ready');
    expect(dashboardGate({ ...base, role: 'admin', hasProfile: false, dbReady: false })).toBe('loading');
  });
});

describe('describeProbe', () => {
  it('tells a firewall refusal (a web page answering for the API) from a refused account and from an expired login', () => {
    expect(describeProbe({ status: 403, html: true })).toMatch(/firewall or security check/);
    expect(describeProbe({ status: 403, html: false })).toMatch(/not allowed/);
    expect(describeProbe({ status: 401, html: false })).toMatch(/sign in again/);
    expect(describeProbe({ status: null, html: false })).toMatch(/could not be reached/);
    expect(describeProbe({ status: 502, html: true })).toMatch(/problem \(error 502\)/);
  });
});
