import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

// Runs the REAL pb_hooks/tracker_disconnect_notices.pb.js against a fake PocketBase.
const source = readFileSync('pb_hooks/tracker_disconnect_notices.pb.js', 'utf8');
const NOW = Date.UTC(2026, 10, 11, 18, 0, 0);
const ago = (min: number) => new Date(NOW - min * 60000).toISOString();
const EMAIL = 'emp@x.com';

class Rec {
  constructor(public collection: string, public data: Record<string, unknown> = {}) {}
  get(k: string) { return this.data[k]; }
  getString(k: string) { const v = this.data[k]; return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); }
  getId() { return String(this.data.id ?? 'id1'); }
  set(k: string, v: unknown) { this.data[k] = v; }
}

type Db = { shifts: Rec[]; signals: Rec[]; outages: Rec[]; tracked?: boolean };

function run(db: Db) {
  const notes: Rec[] = [];
  const dao = {
    findRecordsByFilter: (c: string, f: string, _s: string, _l: number, _o: number, p: { email?: string; e?: string } = {}) => {
      if (c === 'hr_timesheets') return db.shifts.filter(s => !s.get('clock_out'));
      if (c === 'hr_tracking_settings') return db.tracked === false ? [] : [new Rec(c, { employeeEmail: EMAIL, enabled: true })];
      if (c === 'hr_tracker_signals') return db.signals.filter(r => String(r.get('email')).includes(String(p.email)));
      if (c === 'hr_tracker_disconnects') return db.outages.filter(o => o.get('status') === 'open' && (p.e === undefined || o.get('employee_id') === p.e));
      return [];
    },
    findCollectionByNameOrId: (n: string) => n,
    saveRecord: (r: Rec) => {
      if (r.collection === 'hr_notifications') notes.push(r);
      else if (r.collection === 'hr_tracker_disconnects' && !db.outages.includes(r)) db.outages.push(r);
    },
  };
  let job: () => void = () => {};
  const sandbox = { cronAdd: (_n: string, _s: string, fn: () => void) => { job = fn; }, $app: { dao: () => dao }, Record: Rec, console, Date: class extends Date { constructor(v?: number | string) { super(v === undefined ? NOW : v); } static now() { return NOW; } } };
  vm.runInNewContext(source, sandbox);
  job();
  return notes;
}

const shift = () => new Rec('hr_timesheets', { employee_id: EMAIL, clock_in: ago(120), clock_out: '' });
const signals = (minAgo: number, extra: Record<string, unknown> = {}, quit?: number) =>
  new Rec('hr_tracker_signals', { email: EMAIL, heartbeat: { lastSeenAt: ago(minAgo), ...extra }, ...(quit === undefined ? {} : { quit_intent: { timestamp: ago(quit) } }) });
const outage = (status: string, minAgo: number) => new Rec('hr_tracker_disconnects', { employee_id: EMAIL, status, disconnected_at: ago(minAgo) });

describe('tracker disconnect hook', () => {
  it('records an outage at the last signal and pushes only that employee', () => {
    const db: Db = { shifts: [shift()], signals: [signals(6)], outages: [] };
    const notes = run(db);
    expect(db.outages).toHaveLength(1);
    expect(db.outages[0].get('disconnected_at')).toBe(ago(6));
    expect(db.outages[0].get('reason_code')).toBe('no_signal');
    expect(notes).toHaveLength(1);
    expect(notes[0].get('recipient_email')).toBe(EMAIL);
    expect(notes[0].get('category')).toBe('tracker_alert');
    expect(notes[0].get('message')).not.toMatch(/\$/);
  });

  it('does nothing while the tracker is still reporting', () => {
    const db: Db = { shifts: [shift()], signals: [signals(2)], outages: [] };
    expect(run(db)).toHaveLength(0);
    expect(db.outages).toHaveLength(0);
  });

  it('sends one notice per outage, not one per minute', () => {
    const db: Db = { shifts: [shift()], signals: [signals(6)], outages: [] };
    run(db);
    expect(run(db)).toHaveLength(0);
    expect(db.outages).toHaveLength(1);
  });

  it('names a deliberate quit at once, without waiting four minutes', () => {
    const db: Db = { shifts: [shift()], signals: [signals(1, {}, 0)], outages: [] };
    const notes = run(db);
    expect(db.outages[0].get('reason_code')).toBe('closed_by_user');
    expect(notes[0].get('message')).toMatch(/closed the tracker/);
  });

  it('ignores a quit from an earlier day', () => {
    const db: Db = { shifts: [shift()], signals: [signals(6, {}, 1000)], outages: [] };
    run(db);
    expect(db.outages[0].get('reason_code')).toBe('no_signal');
  });

  it('says locked and capture problems when the last signal showed them', () => {
    const a: Db = { shifts: [shift()], signals: [signals(6, { isLocked: true })], outages: [] };
    run(a);
    expect(a.outages[0].get('reason_code')).toBe('locked');
    const b: Db = { shifts: [shift()], signals: [signals(6, { consecutiveCaptureFailures: 4 })], outages: [] };
    run(b);
    expect(b.outages[0].get('reason_code')).toBe('capture_problem');
  });

  it('records the reconnect with the length of the outage and pushes it', () => {
    const o = outage('open', 20);
    const db: Db = { shifts: [shift()], signals: [signals(1)], outages: [o] };
    const notes = run(db);
    expect(o.get('status')).toBe('reconnected');
    expect(o.get('duration')).toBe('19m');
    expect(notes).toHaveLength(1);
    expect(notes[0].get('push_title')).toBe('Tracker reconnected');
  });

  it('a second drop later in the shift is its own outage with its own push', () => {
    const db: Db = { shifts: [shift()], signals: [signals(6)], outages: [outage('reconnected', 60)] };
    const notes = run(db);
    expect(db.outages).toHaveLength(2);
    expect(notes).toHaveLength(1);
  });

  it('closes an open outage quietly when the shift has ended', () => {
    const o = outage('open', 30);
    const ended = shift(); ended.set('clock_out', ago(5));
    const db: Db = { shifts: [ended], signals: [signals(30)], outages: [o] };
    expect(run(db)).toHaveLength(0);
    expect(o.get('status')).toBe('shift_ended');
  });

  it('stays quiet when there is no shift, the tracker is not required, or it never connected this shift', () => {
    expect(run({ shifts: [], signals: [signals(6)], outages: [] })).toHaveLength(0);
    expect(run({ shifts: [shift()], signals: [signals(6)], outages: [], tracked: false })).toHaveLength(0);
    expect(run({ shifts: [shift()], signals: [signals(600)], outages: [] })).toHaveLength(0);
  });
});
