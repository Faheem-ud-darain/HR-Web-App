// Server-only: the PocketBase side of the HR payroll writes (see core/payrollPay.ts for the order of the steps and why).
// Every write here is built so a second run after a failure does not do anything twice.
import type { PbRow } from '../pbTypes';
import { getNYDateString } from '../timezone';
import { adminFindByField, adminListPayrollForEmployee, adminUpsertByField, pbAdminFetch, rememberAdminUpsertId } from '../pbAdmin';
import { mapProfileRecord } from '../core/profiles';
import { toPayrollRowFields } from '../core/payrollMappers';
import { PayError, type PayStore } from '../core/payrollPay';
import { breakdownKey, loadPayrollInputsFor } from './payrollInputs';

const extrasOf = async (profileId: string) => {
  const row = await adminFindByField('hr_profile_extras', 'profile_id', profileId);
  if (row) rememberAdminUpsertId('hr_profile_extras', 'profile_id', profileId, row.id);
  return (row?.data || {}) as PbRow;
};

export function pocketBasePayStore(): PayStore {
  return {
    async loadEmployee(employeeId) {
      let row: PbRow | null = null;
      try { row = await pbAdminFetch(`/api/collections/hr_profiles/records/${employeeId}`); } catch { return null; }
      if (!row?.id) return null;
      const extras = await extrasOf(row.id);
      const banked: unknown = extras.reservedBankedMonths;
      return { profile: mapProfileRecord(row, extras), reservedBankedMonths: Array.isArray(banked) ? banked.map(String) : [] };
    },

    loadInputs: (profile, now, sinceMonth) => loadPayrollInputsFor(profile, now, sinceMonth),

    async saveRecord(record) {
      let id = record.id && record.id.length === 15 ? record.id : '';
      if (!id) {
        // The freeze step may already have created this month's row.
        const rows = await adminListPayrollForEmployee(record.employeeId);
        id = rows.find(r => r.month === record.month)?.id || '';
      }
      const fields = toPayrollRowFields(record, getNYDateString(new Date()));
      if (id) {
        if (!record.processed) {
          // Writing the month down (or a bonus) must never turn a salary that was marked paid a moment ago back into an unpaid one.
          const latest = await pbAdminFetch(`/api/collections/hr_payroll/records/${id}?fields=id,processed`);
          if (latest?.processed) throw new PayError('This month was just marked as paid. Refresh the page.', 409);
        }
        await pbAdminFetch(`/api/collections/hr_payroll/records/${id}`, { method: 'PATCH', body: JSON.stringify(fields) });
      } else {
        const created = await pbAdminFetch('/api/collections/hr_payroll/records', { method: 'POST', body: JSON.stringify(fields) });
        id = created?.id || '';
      }
      // The itemised "why was I deducted" list and the new-joiner timing, kept beside the row. Once frozen or paid the figures are final.
      if (record.employeeId && record.month) {
        await adminUpsertByField('hr_payroll_breakdowns', 'breakdown_key', breakdownKey(record.employeeId, record.month), {
          deductionBreakdown: Array.isArray(record.deductionBreakdown) ? record.deductionBreakdown : [],
          reservedThisMonth: Number(record.reservedThisMonth) || 0,
          deferredThisMonth: Number(record.deferredThisMonth) || 0,
          earlierPay: Number(record.earlierPay) || 0,
          earlierPayLabel: typeof record.earlierPayLabel === 'string' ? record.earlierPayLabel.slice(0, 120) : '',
          frozen: record.frozen === true || record.processed === true,
          frozenAt: new Date().toISOString(),
        });
      }
      return { id };
    },

    async raiseSalary(profile, raise) {
      // Same care as the monthly job: only raise the salary we planned from, write "this anniversary is done" FIRST, then the
      // raise, and put the marker back if the raise fails. A missed raise is visible and fixable; a double one is not.
      const fresh = await pbAdminFetch(`/api/collections/hr_profiles/records/${profile.id}`);
      if (Number(fresh?.base_salary) !== profile.baseSalary) throw new PayError('The salary changed while this was running. Press Pay again.', 409);
      const extras = await extrasOf(profile.id);
      if (Number(extras.lastIncrementProcessedYear) >= raise.processedThroughYear) return; // a previous try already did this one
      await adminUpsertByField('hr_profile_extras', 'profile_id', profile.id, { ...extras, lastIncrementProcessedYear: raise.processedThroughYear });
      try {
        await pbAdminFetch(`/api/collections/hr_profiles/records/${profile.id}`, { method: 'PATCH', body: JSON.stringify({ base_salary: raise.newBaseSalary }) });
      } catch (err) {
        await adminUpsertByField('hr_profile_extras', 'profile_id', profile.id, extras).catch(() => { /* left marked: see above */ });
        throw err;
      }
    },

    async bankReserve(profile, add, month) {
      // The balance and the list of months already banked go in ONE write, so they can never disagree.
      const extras = await extrasOf(profile.id);
      const months = Array.isArray(extras.reservedBankedMonths) ? extras.reservedBankedMonths.map(String) : [];
      if (months.includes(month)) return;
      await adminUpsertByField('hr_profile_extras', 'profile_id', profile.id, {
        ...extras,
        reservedSalaryBalance: (Number(extras.reservedSalaryBalance) || 0) + add,
        reservedBankedMonths: [...months, month],
      });
    },
  };
}
