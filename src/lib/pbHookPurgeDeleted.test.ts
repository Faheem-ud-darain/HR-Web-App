import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

// Runs the REAL pb_hooks/purge_deleted_employee_data.pb.js against a fake PocketBase.
const source = readFileSync('pb_hooks/purge_deleted_employee_data.pb.js', 'utf8');
type Row = { collection: string; data: Record<string, string> };
const FIELD: Record<string, string> = { hr_absence_records: 'employeeEmail', hr_inactivity_logs: 'employee_email', hr_user_sessions: 'email' };
const row = (collection: string, email: string): Row => ({ collection, data: { [FIELD[collection] ?? 'email']: email } });

function setup(profiles: string[], rows: Row[]) {
  const db = [...rows];
  const dao = {
    findRecordsByFilter: (c: string, filter: string, _s: string, limit: number, offset: number, p: { e?: string } = {}) => {
      if (c === 'hr_profiles') return profiles.map(email => ({ get: () => email }));
      if (c === 'hr_tracker_disconnects') throw new Error('sql: no rows in result set'); // a table that does not exist yet must not stop the rest
      const f = FIELD[c] ?? 'email';
      const wanted = db.filter(r => r.collection === c && (p.e === undefined || r.data[f].toLowerCase().includes(p.e)));
      return wanted.slice(offset, offset + limit).map(r => ({ ...r, get: (k: string) => r.data[k], self: r }));
    },
    deleteRecord: (r: { self: Row }) => { db.splice(db.indexOf(r.self), 1); },
  };
  let onDelete: (e: { record: { get: (k: string) => string } }) => void = () => {};
  let job: () => void = () => {};
  const sandbox = { onRecordAfterDeleteRequest: (fn: typeof onDelete) => { onDelete = fn; }, cronAdd: (_n: string, _s: string, fn: () => void) => { job = fn; }, $app: { dao: () => dao }, console };
  vm.runInNewContext(source, sandbox);
  return { db, onDelete, job };
}

describe('purge of a deleted employee\'s data', () => {
  it('removes everything keyed by the email the moment the profile is deleted, and nothing of anyone else', () => {
    const t = setup([], [row('hr_absence_records', 'Gone@x.com'), row('hr_user_sessions', 'gone@x.com'), row('hr_absence_records', 'stay@x.com')]);
    t.onDelete({ record: { get: () => 'gone@x.com' } });
    expect(t.db.map(r => Object.values(r.data)[0])).toEqual(['stay@x.com']);
  });

  it('the nightly sweep removes rows whose email has no profile, whatever its casing, and keeps the rest', () => {
    const t = setup(['a@x.com', 'b@x.com', 'c@x.com'], [row('hr_absence_records', 'Orphan@X.com'), row('hr_inactivity_logs', 'orphan@x.com'), row('hr_absence_records', 'a@x.com')]);
    t.job();
    expect(t.db.map(r => Object.values(r.data)[0])).toEqual(['a@x.com']);
  });

  it('the sweep does nothing when too few profiles read back', () => {
    const t = setup(['a@x.com'], [row('hr_absence_records', 'stranger@x.com')]);
    t.job();
    expect(t.db).toHaveLength(1);
  });
});
