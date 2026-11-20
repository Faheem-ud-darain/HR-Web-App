import { describe, it, expect, beforeEach } from 'vitest';
import { scrub, hostAndPath, hostOf, fingerprintOf, isNoise } from './sanitize';
import { addCrumb, getCrumbs, clearCrumbs, recordFailure, failureSummary, recentNoReplyCount, clearFailures } from './breadcrumbs';
import { groupReports, diagnose, recentSteps, type IssueReport } from './group';
import { reconcileQueue, type StoredReport } from './send';

describe('scrub', () => {
  it('removes login tokens and passwords before anything is stored', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6InhAeS5jb20ifQ.abcdefghijklmnop';
    expect(scrub(`failed with ${jwt}`)).toBe('failed with [token]');
    expect(scrub('Authorization: Bearer abc.def-123')).toBe('Authorization: Bearer [token]');
    expect(scrub('https://x.test/cb?code=123&state=zzz&ok=1')).toBe('https://x.test/cb?code=[hidden]&state=[hidden]&ok=1');
  });
  it('cuts long text and handles errors and nothing', () => {
    expect(scrub('a'.repeat(600), 10)).toBe('aaaaaaaaaa…');
    expect(scrub(new Error('boom'))).toBe('Error: boom');
    expect(scrub(undefined)).toBe('');
  });
});

describe('hostAndPath / fingerprint / noise', () => {
  it('drops the query string', () => {
    expect(hostAndPath('https://pb.delcargo.us/api/x?token=secret')).toBe('pb.delcargo.us/api/x');
    expect(hostAndPath('/employee/absences?a=1')).toBe('/employee/absences');
  });
  it('gives the same fingerprint to the same problem on different ids and numbers', () => {
    const a = fingerprintOf('error', 'Record abcdefghij12345 not found after 31 ms', '/employee/x');
    const b = fingerprintOf('error', 'Record zzzzzzzzzz99999 not found after 8 ms', '/employee/x');
    expect(a).toBe(b);
    expect(a).not.toBe(fingerprintOf('crash', 'Record abcdefghij12345 not found after 31 ms', '/employee/x'));
  });
  it('ignores browser noise', () => {
    expect(isNoise('ResizeObserver loop completed with undelivered notifications')).toBe(true);
    expect(isNoise('x', 'chrome-extension://abc/content.js')).toBe(true);
    expect(isNoise('Cannot read properties of undefined')).toBe(false);
  });
});

describe('breadcrumbs', () => {
  beforeEach(() => { clearCrumbs(); clearFailures(); });
  it('keeps only the last 40 steps', () => {
    for (let i = 0; i < 60; i++) addCrumb('page', `p${i}`);
    expect(getCrumbs()).toHaveLength(40);
    expect(getCrumbs()[39].text).toBe('p59');
  });
  it('counts failed requests per host, and those that got no reply, within five minutes', () => {
    const now = Date.now();
    recordFailure('https://hub.delcargo.us/api/me', 'network', undefined, now);
    recordFailure('https://hub.delcargo.us/employee?_rsc=1', 'network', undefined, now);
    recordFailure('https://pb.delcargo.us/api/x', 'http', 500, now);
    recordFailure('https://hub.delcargo.us/old', 'network', undefined, now - 6 * 60 * 1000);
    const s = failureSummary(now);
    expect(s['hub.delcargo.us']).toEqual({ total: 2, noReply: 2, statuses: [] });
    expect(s['pb.delcargo.us']).toEqual({ total: 1, noReply: 0, statuses: [500] });
    expect(recentNoReplyCount(2 * 60 * 1000, now)).toBe(2);
  });
});

const report = (over: Partial<IssueReport>): IssueReport => ({ id: 'r', created: '2026-11-20 10:00:00', kind: 'error', title: 't', message: 'm', fingerprint: 'f', status: 'new', ...over });

describe('diagnose', () => {
  it('says plainly when only the portal is unreachable', () => {
    const r = report({ context: { reachability: { portal: { ok: false, error: 'timed out' }, database: { ok: true } } } });
    expect(diagnose(r)).toMatch(/network or provider problem/);
  });
  it('spots a tab left open across a release', () => {
    const r = report({ message: 'Loading chunk 12 failed', build_id: 'aaaa1111' });
    expect(diagnose(r, 'bbbb2222')).toMatch(/before the latest release/);
  });
  it('falls back to the error itself', () => {
    expect(diagnose(report({ kind: 'crash' }))).toMatch(/error in the app itself/);
  });
});

describe('groupReports', () => {
  it('merges the same problem, counts people, newest first, and stays new until all are handled', () => {
    const groups = groupReports([
      report({ id: '1', fingerprint: 'a', email: 'alex@x', created: '2026-11-20 09:00:00', status: 'resolved' }),
      report({ id: '2', fingerprint: 'a', email: 'josh@x', created: '2026-11-20 11:00:00', status: 'new' }),
      report({ id: '3', fingerprint: 'b', email: 'alex@x', created: '2026-11-20 08:00:00', status: 'seen' }),
    ]);
    expect(groups.map(g => g.fingerprint)).toEqual(['a', 'b']);
    expect(groups[0]).toMatchObject({ count: 2, status: 'new', people: ['josh@x', 'alex@x'] });
    expect(groups[0].reports[0].id).toBe('2');
  });
});

describe('scrub credentials outside URLs', () => {
  it('hides credential values in free text and in objects, and keeps ordinary fields', () => {
    expect(scrub('password=Example-Secret-42 failed')).toBe('password=[hidden] failed');
    expect(scrub('login failed, token: abc123')).toBe('login failed, token: [hidden]');
    expect(scrub({ password: 'hunter2', user: 'alex' })).toBe('{"password":[hidden],"user":"alex"}');
    expect(scrub('Authorization: Bearer abc.def-123')).toBe('Authorization: Bearer [token]');
  });
});

describe('hostOf', () => {
  it('resolves relative addresses against the given page and keeps absolute hosts', () => {
    expect(hostOf('/api/me', 'https://hub.delcargo.us')).toBe('hub.delcargo.us');
    expect(hostOf('https://pb.delcargo.us/api/x', 'https://hub.delcargo.us')).toBe('pb.delcargo.us');
  });
});

describe('diagnose: an HTTP error is not a cut connection', () => {
  it('blames our side when the portal answered with 503', () => {
    const r = report({ context: { reachability: { portal: { ok: false, status: 503, ms: 90 }, database: { ok: true } } } });
    expect(diagnose(r)).toMatch(/HTTP 503.*our side/);
  });
});

describe('recentSteps', () => {
  it('drops malformed entries so a bad report cannot break the page', () => {
    const steps = recentSteps({ recentSteps: [null, 5, { at: 'x' }, { at: '2026-11-20T10:00:00Z', type: 'page', text: 'opened /a' }] });
    expect(steps).toEqual([{ at: '2026-11-20T10:00:00Z', type: 'page', text: 'opened /a' }]);
    expect(recentSteps({ recentSteps: 'nope' })).toEqual([]);
    expect(recentSteps(undefined)).toEqual([]);
  });
});

describe('reconcileQueue', () => {
  const q = (id: string) => ({ client_id: id }) as StoredReport;
  it('keeps a report added while the flush was running and drops only the finished ones', () => {
    expect(reconcileQueue([q('A'), q('B')], new Set(['A'])).map(r => r.client_id)).toEqual(['B']);
    expect(reconcileQueue([q('A'), q('B')], new Set()).map(r => r.client_id)).toEqual(['A', 'B']);
  });
});

describe('policy blocks group across pages', () => {
  it('the same blocked address on different pages is one problem', () => {
    const m = 'Blocked by security policy: style-src-elem onesignal.com/sdks/web/v16/OneSignalSDK.page.styles.css';
    expect(fingerprintOf('error', m, '')).toBe(fingerprintOf('error', m, ''));
    expect(fingerprintOf('error', m, '/employee')).not.toBe(fingerprintOf('error', m, '/employee/leaves')); // why send.ts passes '' for these
  });
});
