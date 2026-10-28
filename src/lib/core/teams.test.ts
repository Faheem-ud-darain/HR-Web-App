import { describe, it, expect } from 'vitest';
import { findStaleWarehouseLinks, isTeamLead, isWarehouseManager, leadChanges, membersOfTeam, membershipChanges, mergeTeamAssignment, teamNamesFor, toggleInList } from './teams';
import type { Profile, Team } from '../hr/types';

const team = (id: string, name: string, members: string[], extra: Partial<Team> = {}): Team => ({ id, name, members, ...extra });
const person = (extra: Partial<Profile>) => ({ id: 'p', email: 'a@x.us', teams: [], ...extra }) as Profile;

describe('lead and manager flags', () => {
  it('counts a lead only while they lead a team', () => {
    expect(isTeamLead({ isTeamLead: true, leadTeams: ['Ops'] })).toBe(true);
    expect(isTeamLead({ isTeamLead: true, leadTeams: [] })).toBe(false);
    expect(isTeamLead({ isTeamLead: false, leadTeams: ['Ops'] })).toBe(false);
    expect(isTeamLead({})).toBe(false);
    expect(isWarehouseManager({ isWarehouseLead: true, managedWarehouses: ['w1'] })).toBe(true);
    expect(isWarehouseManager({ isWarehouseLead: true })).toBe(false);
  });
});

describe('membership', () => {
  const teams = [team('t1', 'Ops', ['a@x.us', 'b@x.us']), team('t2', 'QA', ['b@x.us']), team('t3', 'IT', [])];

  it('lists the teams a person is in', () => {
    expect(teamNamesFor(teams, 'b@x.us')).toEqual(['Ops', 'QA']);
    expect(teamNamesFor(teams, 'nobody@x.us')).toEqual([]);
  });

  it('writes only the teams that change', () => {
    // a@x.us: in Ops, wants QA + IT -> leave Ops, join QA and IT
    expect(membershipChanges(teams, 'a@x.us', ['QA', 'IT'])).toEqual([
      { id: 't1', members: ['b@x.us'] }, { id: 't2', members: ['b@x.us', 'a@x.us'] }, { id: 't3', members: ['a@x.us'] },
    ]);
    expect(membershipChanges(teams, 'a@x.us', ['Ops'])).toEqual([]); // already exactly that
    expect(membershipChanges(teams, 'b@x.us', [])).toEqual([{ id: 't1', members: ['a@x.us'] }, { id: 't2', members: [] }]);
  });

  it('merges or replaces teams when moving someone who is already in some', () => {
    expect(mergeTeamAssignment(['Ops'], 'QA', 'both')).toEqual(['Ops', 'QA']);
    expect(mergeTeamAssignment(['Ops', 'QA'], 'QA', 'both')).toEqual(['Ops', 'QA']); // no duplicate
    expect(mergeTeamAssignment(['Ops'], 'QA', 'reassign')).toEqual(['QA']);
  });

  it('finds team members, falling back to profile team names when the team record is missing', () => {
    const people = [person({ id: '1', email: 'a@x.us', teams: ['Ops'] }), person({ id: '2', email: 'c@x.us', teams: ['Ops'] })];
    expect(membersOfTeam(people, teams[0], 'Ops').map(p => p.id)).toEqual(['1']);
    expect(membersOfTeam(people, undefined, 'Ops').map(p => p.id)).toEqual(['1', '2']);
  });

  it('toggles an item in a list', () => {
    expect(toggleInList(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleInList(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('leadChanges', () => {
  const teams = [team('t1', 'Ops', [], { leadEmail: 'a@x.us' }), team('t2', 'QA', [], { leadEmail: 'z@x.us' }), team('t3', 'IT', [])];
  it('sets the lead on newly selected teams and clears teams no longer led', () => {
    expect(leadChanges(teams, 'a@x.us', ['QA', 'IT'])).toEqual([
      { id: 't1', leadEmail: '' }, { id: 't2', leadEmail: 'a@x.us' }, { id: 't3', leadEmail: 'a@x.us' },
    ]);
  });
  it('leaves other people\'s teams and unchanged teams alone', () => {
    expect(leadChanges(teams, 'a@x.us', ['Ops'])).toEqual([]);
    expect(leadChanges(teams, 'a@x.us', [])).toEqual([{ id: 't1', leadEmail: '' }]);
  });
});

describe('findStaleWarehouseLinks', () => {
  const live = new Set(['w1', 'w2']);
  it('flags profiles and teams that point at a warehouse that no longer exists', () => {
    const profiles = [
      person({ id: '1', assignedWarehouses: ['w1', 'gone'] }), person({ id: '2', managedWarehouses: ['gone'] }),
      person({ id: '3', assignedWarehouses: ['w2'] }), person({ id: '4' }),
    ];
    const teams = [team('t1', 'Ops', [], { warehouseId: 'gone' }), team('t2', 'QA', [], { warehouseId: 'w1' }), team('t3', 'IT', [])];
    const r = findStaleWarehouseLinks(profiles, teams, live);
    expect(r.staleProfiles.map(p => p.id)).toEqual(['1', '2']);
    expect(r.staleTeams.map(t => t.id)).toEqual(['t1']);
  });
  it('finds nothing when every link is valid', () => {
    const r = findStaleWarehouseLinks([person({ assignedWarehouses: ['w1'] })], [team('t', 'T', [], { warehouseId: 'w2' })], live);
    expect(r).toEqual({ staleProfiles: [], staleTeams: [] });
  });
});
