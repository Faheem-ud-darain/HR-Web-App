import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

// Runs the REAL pb_hooks/auto_close_stale_shifts.pb.js against a fake PocketBase, so the rules that close shifts on the live server are tested.
const source = readFileSync('pb_hooks/auto_close_stale_shifts.pb.js', 'utf8');
const NOW = Date.UTC(2026, 10, 5, 18, 0, 0);
const ago = (min: number) => new Date(NOW - min * 60000).toISOString();

class Rec {
  constructor(public collection: string, public data: Record<string, unknown> = {}) {}
  get(k: string) { return this.data[k]; }
  getString(k: string) { return String(this.data[k] ?? ''); }
  set(k: string, v: unknown) { this.data[k] = v; }
}

function runHook(db: { shifts: Rec[]; profiles: Rec[]; heartbeats: Rec[] }) {
  const saved: Rec[] = [];
  const notes: Rec[] = [];
  const byEmail = (rows: Rec[], key: string, p: { email?: string }) => rows.filter(r => String(r.get(key)).toLowerCase().includes(String(p.email)));
  const dao = {
    findRecordsByFilter: (collection: string, _f: string, _s: string, _l: number, _o: number, p: { email?: string } = {}) => {
      if (collection === 'hr_timesheets') return db.shifts.filter(s => !s.get('clock_out'));
      if (collection === 'hr_profiles') return byEmail(db.profiles, 'email', p);
      if (collection === 'hr_shift_tab_heartbeats') return byEmail(db.heartbeats, 'email', p);
      return []; // hr_tracking_settings, hr_tracker_signals: nothing
    },
    findCollectionByNameOrId: (name: string) => name,
    saveRecord: (r: Rec) => { (r.collection === 'hr_notifications' ? notes : saved).push(r); },
    deleteRecord: (r: Rec) => { db.heartbeats.splice(db.heartbeats.indexOf(r), 1); },
  };
  let job: () => void = () => {};
  const sandbox = { cronAdd: (_n: string, _s: string, fn: () => void) => { job = fn; }, $app: { dao: () => dao }, Record: Rec, console, Date: class extends Date { constructor(v?: number | string) { super(v === undefined ? NOW : v); } static now() { return NOW; } } };
  vm.runInNewContext(source, sandbox);
  job();
  return { saved, notes };
}

const shift = (email: string, startedMinAgo: number) => new Rec('hr_timesheets', { employee_id: email, clock_in: ago(startedMinAgo), clock_out: '' });
const profile = (email: string, region: string) => new Rec('hr_profiles', { email, region, full_name: 'Test Person', tracking_enabled: false });
const beat = (email: string, minAgo: number) => new Rec('hr_shift_tab_heartbeats', { email, last_seen_at: ago(minAgo) });

describe('auto-close hook: USA GPS shifts', () => {
  it('closes at the last heartbeat when the app has been silent for 10+ minutes, and tells the employee, HR and Admin', () => {
    const s = shift('usa@x.com', 180);
    const { saved, notes } = runHook({ shifts: [s], profiles: [profile('usa@x.com', 'USA')], heartbeats: [beat('usa@x.com', 15)] });
    expect(saved).toHaveLength(1);
    expect(s.get('clock_out')).toBe(ago(15));
    expect(s.get('duration')).toBe('2h 45m');
    expect(notes.map(n => n.get('recipient_role')).sort()).toEqual(['admin', 'employee', 'hr']);
  });

  it('leaves a shift alone while the app is still reporting', () => {
    const s = shift('usa@x.com', 180);
    runHook({ shifts: [s], profiles: [profile('usa@x.com', 'USA')], heartbeats: [beat('usa@x.com', 5)] });
    expect(s.get('clock_out')).toBe('');
  });

  it('leaves a shift alone when there is no heartbeat from this shift (an older app that never sends one)', () => {
    const none = shift('usa@x.com', 180);
    runHook({ shifts: [none], profiles: [profile('usa@x.com', 'USA')], heartbeats: [] });
    expect(none.get('clock_out')).toBe('');
    const before = shift('usa@x.com', 180);
    runHook({ shifts: [before], profiles: [profile('usa@x.com', 'USA')], heartbeats: [beat('usa@x.com', 300)] });
    expect(before.get('clock_out')).toBe('');
  });

  it('closes a young shift too: a phone closed right after clock-in is not left open until the 45-minute age', () => {
    const young = shift('usa@x.com', 20);
    runHook({ shifts: [young], profiles: [profile('usa@x.com', 'USA')], heartbeats: [beat('usa@x.com', 12)] });
    expect(young.get('clock_out')).toBe(ago(12));
  });
});

describe('auto-close hook: other employees are unchanged', () => {
  it('a Pakistan manual shift whose portal went silent is still closed, at the current time', () => {
    const s = shift('pk@x.com', 180);
    runHook({ shifts: [s], profiles: [profile('pk@x.com', 'Pakistan')], heartbeats: [beat('pk@x.com', 40)] });
    expect(s.get('clock_out')).toBe(new Date(NOW).toISOString());
  });
  it('a shift past the 16-hour cap is still closed', () => {
    const s = shift('usa@x.com', 17 * 60);
    runHook({ shifts: [s], profiles: [profile('usa@x.com', 'USA')], heartbeats: [] });
    expect(s.get('clock_out')).toBe(ago(17 * 60 - 16 * 60));
  });
});
