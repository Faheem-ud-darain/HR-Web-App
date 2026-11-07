// Server-only: the one way a yearly raise is written. The monthly job and the Admin "Pay" button both use it, so they cannot drift apart.
// "This anniversary is done" is written FIRST, then the raise; if the raise fails the marker is put back. A missed raise is visible and
// fixable by hand; a double one is not.
import type { PbRow } from '../pbTypes';
import { adminFindByField, adminUpsertByField, pbAdminFetch, rememberAdminUpsertId } from '../pbAdmin';

export class SalaryChangedError extends Error {
  constructor() { super('The salary changed while this was running.'); }
}

/** The extras row (JSON overlay) of one profile; also remembers its id so the next upsert is one request. */
export async function loadProfileExtras(profileId: string): Promise<PbRow> {
  const row = await adminFindByField('hr_profile_extras', 'profile_id', profileId);
  if (row) rememberAdminUpsertId('hr_profile_extras', 'profile_id', profileId, row.id);
  return (row?.data || {}) as PbRow;
}

/**
 * Raises one salary. `profile.baseSalary` is the salary the plan was made from: if the stored salary is no longer exactly that,
 * nothing is written (SalaryChangedError). Returns 'already_done' when a previous try or run already recorded this anniversary.
 */
export async function applyRaise(profile: { id: string; baseSalary: number }, raise: { newBaseSalary: number; processedThroughYear: number }): Promise<'raised' | 'already_done'> {
  const fresh = await pbAdminFetch(`/api/collections/hr_profiles/records/${profile.id}`);
  if (Number(fresh?.base_salary) !== profile.baseSalary) throw new SalaryChangedError();
  const extras = await loadProfileExtras(profile.id);
  if (Number(extras.lastIncrementProcessedYear) >= raise.processedThroughYear) return 'already_done';
  await adminUpsertByField('hr_profile_extras', 'profile_id', profile.id, { ...extras, lastIncrementProcessedYear: raise.processedThroughYear });
  try {
    await pbAdminFetch(`/api/collections/hr_profiles/records/${profile.id}`, { method: 'PATCH', body: JSON.stringify({ base_salary: raise.newBaseSalary }) });
  } catch (err) {
    await adminUpsertByField('hr_profile_extras', 'profile_id', profile.id, extras).catch(() => { /* left marked: see above */ });
    throw err;
  }
  return 'raised';
}
