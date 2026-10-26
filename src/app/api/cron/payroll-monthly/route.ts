import { NextResponse } from 'next/server';
import type { PbRow } from '@/lib/pbTypes';
import { getNYDateString } from '@/lib/timezone';
import { pbAdminFetch, adminFindByField, adminUpsertByField, adminAddNotification, rememberAdminUpsertId } from '@/lib/pbAdmin';
import { toPayrollRowFields } from '@/lib/core/payrollMappers';
import { loadPayrollInputs, breakdownKey } from '@/lib/server/payrollInputs';
import { computePayrollView } from '@/lib/core/payroll';
import { monthLabel } from '@/lib/core/payrollView';
import { decideIncrement, monthToFreeze } from '@/lib/core/payrollMonthly';

export const runtime = 'edge';

// The two monthly payroll jobs, called by the Cloudflare cron Worker (workers/cron). The rules are in
// lib/core/payrollMonthly.ts (tested); the pay maths is the same computePayrollView the screens use.
//
// POST /api/cron/payroll-monthly?mode=preview|freeze|increments
//   Authorization: Bearer <CRON_SECRET>
//   preview     changes nothing: what would be frozen and which raises would be applied
//   freeze      writes down last month's numbers, one small batch per call (see BATCH_FREEZE)
//   increments  applies due raises — only after last month is fully frozen
//
// Why batches: an edge function may make only about 50 outgoing requests per call. Reading everything
// takes roughly 10–20 of them and every salary written costs 2, so the Worker simply calls again every
// few minutes until the job reports it is finished. Calling an already-finished job costs a few reads.
// Frozen salaries are never touched again; paid salaries are never touched at all.
const BATCH_FREEZE = 10;
const BATCH_INCREMENTS = 3; // ~5 outgoing requests per raise on top of ~20 reads: keeps well under the ~50 limit
const STATE_KEY = 'payroll_monthly_cron';
const LOG_KEY = 'increment_log';

interface State { frozen?: Record<string, { at: string; count: number }>; incrementsDone?: Record<string, string> }

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET || '';
  if (secret.length < 24) return NextResponse.json({ error: 'The cron secret is not configured.' }, { status: 503 });
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!sameSecret(given, secret)) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });

  const mode = new URL(request.url).searchParams.get('mode') || 'preview';
  if (!['preview', 'freeze', 'increments'].includes(mode)) return NextResponse.json({ error: 'Unknown mode.' }, { status: 400 });

  try {
    const now = new Date();
    const nyDate = getNYDateString(now);
    const payMonth = nyDate.slice(0, 7);
    const freezeMonth = monthToFreeze(nyDate);

    const state = ((await adminFindByField('hr_system_state', 'key', STATE_KEY))?.data || {}) as State;
    const freezeDone = !!state.frozen?.[freezeMonth];
    const incrementsDone = !!state.incrementsDone?.[payMonth];
    if (mode === 'freeze' && freezeDone) return NextResponse.json({ status: 'already_frozen', month: freezeMonth });
    if (mode === 'increments' && incrementsDone) return NextResponse.json({ status: 'already_done', month: payMonth });

    // ── read everything the pay maths needs (read-only) ──
    const { profiles, payrollRows, breakdownRows, payroll, leaves, timesheets, absences } = await loadPayrollInputs(now, freezeMonth);
    const breakdownByKey = new Map<string, PbRow>(breakdownRows.map(b => [String(b.breakdown_key), b]));

    // ── what the freeze would write ──
    const view = computePayrollView(profiles, payroll, leaves, timesheets, absences, now, true);
    const toFreeze = view.filter(r => r.month === freezeMonth && !r.processed && !r.frozen);

    // ── which raises are due ──
    const decisions = profiles
      .filter(p => (p.role === 'employee' || p.role === 'team_lead') && !p.offboarded)
      .map(p => ({ profile: p, decision: decideIncrement(p, payMonth) }));
    const dueRaises = decisions.filter(d => d.decision.status === 'apply');
    const skippedRaises = decisions.filter(d => d.decision.status === 'skipped');

    if (mode === 'preview') {
      return NextResponse.json({
        status: 'preview', freezeMonth, payMonth, alreadyFrozen: freezeDone,
        wouldFreeze: toFreeze.map(r => ({ name: r.name, region: r.region, base: r.baseSalary, increment: r.incrementAmount, deductions: r.deductions, bonus: r.bonus })),
        wouldRaise: dueRaises.map(d => ({ name: d.profile.fullName, ...(d.decision as { perEvent: number; newBaseSalary: number; anniversaryMonth: string }) })),
        leftAlone: skippedRaises.map(d => ({ name: d.profile.fullName, reason: (d.decision as { reason: string }).reason })),
      });
    }

    if (mode === 'freeze') {
      const batch = toFreeze.slice(0, BATCH_FREEZE);
      let written = 0;
      let failed = 0;
      let skippedPaid = 0;
      for (const rec of batch) {
        try {
          const fields = toPayrollRowFields({ ...rec, processed: false }, '');
          const existingRow = payrollRows.find(r => r.employee_id === rec.employeeId && r.month === freezeMonth);
          if (existingRow) {
            // The list above was read a few seconds ago. If Admin has marked this salary paid since, leave it
            // entirely alone — freezing must never turn a paid salary back into an unpaid one.
            const latest = await pbAdminFetch(`/api/collections/hr_payroll/records/${existingRow.id}?fields=id,processed`);
            if (latest?.processed) { skippedPaid++; continue; }
            await pbAdminFetch(`/api/collections/hr_payroll/records/${existingRow.id}`, { method: 'PATCH', body: JSON.stringify(fields) });
          } else {
            await pbAdminFetch('/api/collections/hr_payroll/records', { method: 'POST', body: JSON.stringify(fields) });
          }
          const key = breakdownKey(rec.employeeId, freezeMonth);
          const data = {
            deductionBreakdown: rec.deductionBreakdown || [],
            reservedThisMonth: rec.reservedThisMonth || 0,
            deferredThisMonth: rec.deferredThisMonth || 0,
            earlierPay: rec.earlierPay || 0,
            earlierPayLabel: rec.earlierPayLabel || '',
            frozen: true,
            frozenAt: new Date().toISOString(),
          };
          const stored = breakdownByKey.get(key);
          if (stored) await pbAdminFetch(`/api/collections/hr_payroll_breakdowns/records/${stored.id}`, { method: 'PATCH', body: JSON.stringify({ data }) });
          else await pbAdminFetch('/api/collections/hr_payroll_breakdowns/records', { method: 'POST', body: JSON.stringify({ breakdown_key: key, data }) });
          written++;
        } catch (err) {
          failed++;
          console.error('[cron/payroll-monthly] freeze failed for', rec.employeeId, err);
        }
      }
      const remaining = toFreeze.length - written - skippedPaid;
      if (remaining === 0 && failed === 0) {
        const total = view.filter(r => r.month === freezeMonth).length;
        await adminUpsertByField('hr_system_state', 'key', STATE_KEY, { ...state, frozen: { ...(state.frozen || {}), [freezeMonth]: { at: now.toISOString(), count: total } } });
        const msg = `${monthLabel(freezeMonth)} salaries are now final (${total} employees). Late leave or absence records will no longer change them; corrections are made from the salary slip.`;
        await Promise.all([adminAddNotification('all', 'hr', msg, 'internal'), adminAddNotification('all', 'admin', msg)]);
        return NextResponse.json({ status: 'frozen', month: freezeMonth, written, total });
      }
      return NextResponse.json({ status: 'partial', month: freezeMonth, written, failed, remaining });
    }

    // mode === 'increments' — raises only start once last month is final, so it never reshapes a month still open.
    if (!freezeDone && toFreeze.length > 0) return NextResponse.json({ status: 'waiting_for_freeze', month: freezeMonth, remaining: toFreeze.length });

    const logRow = await adminFindByField('hr_system_state', 'key', LOG_KEY);
    const log: Array<Record<string, unknown>> = Array.isArray((logRow?.data as PbRow | undefined)?.entries) ? (logRow!.data as PbRow).entries : [];
    const batch = dueRaises.slice(0, BATCH_INCREMENTS);
    let applied = 0;
    let failed = 0;
    for (const { profile, decision } of batch) {
      if (decision.status !== 'apply') continue;
      try {
        // Re-read this one row right before writing: only raise it if it is still exactly what we planned from.
        const fresh = await pbAdminFetch(`/api/collections/hr_profiles/records/${profile.id}`);
        if (Number(fresh?.base_salary) !== profile.baseSalary) throw new Error('salary changed while the job ran');
        // Write "this anniversary is done" FIRST, then the raise. If the raise then fails we put the marker back,
        // and if even that fails the person is left un-raised (visible in the response and fixable by hand)
        // rather than raised again on the next 10-minute run — a missed raise is safer than a double one.
        const extrasRowNow = await adminFindByField('hr_profile_extras', 'profile_id', profile.id);
        const extrasNow = (extrasRowNow?.data || {}) as PbRow;
        if (extrasRowNow) rememberAdminUpsertId('hr_profile_extras', 'profile_id', profile.id, extrasRowNow.id);
        if (extrasNow.lastIncrementProcessedYear === decision.processedThroughYear) continue; // a previous run already did this one
        await adminUpsertByField('hr_profile_extras', 'profile_id', profile.id, { ...extrasNow, lastIncrementProcessedYear: decision.processedThroughYear });
        try {
          await pbAdminFetch(`/api/collections/hr_profiles/records/${profile.id}`, { method: 'PATCH', body: JSON.stringify({ base_salary: decision.newBaseSalary }) });
        } catch (err) {
          await adminUpsertByField('hr_profile_extras', 'profile_id', profile.id, extrasNow).catch(() => { /* left marked: see above */ });
          throw err;
        }
        log.push({ at: now.toISOString(), email: profile.email, payMonth, anniversaryMonth: decision.anniversaryMonth, from: profile.baseSalary, to: decision.newBaseSalary });
        await adminAddNotification(profile.email, 'employee', `Your annual salary increment has been added to your base salary. It applies to the ${monthLabel(payMonth)} salary.`, 'internal');
        applied++;
      } catch (err) {
        failed++;
        log.push({ at: now.toISOString(), email: profile.email, payMonth, failed: true, reason: err instanceof Error ? err.message.slice(0, 120) : 'error' });
        console.error('[cron/payroll-monthly] raise failed for', profile.id, err);
      }
    }
    if (applied > 0 || failed > 0) await adminUpsertByField('hr_system_state', 'key', LOG_KEY, { entries: log.slice(-500) });
    const remaining = dueRaises.length - applied;
    if (remaining === 0 && failed === 0) {
      await adminUpsertByField('hr_system_state', 'key', STATE_KEY, { ...state, incrementsDone: { ...(state.incrementsDone || {}), [payMonth]: now.toISOString() } });
      return NextResponse.json({ status: 'done', month: payMonth, applied, leftAlone: skippedRaises.length });
    }
    return NextResponse.json({ status: 'partial', month: payMonth, applied, failed, remaining });
  } catch (err) {
    console.error('[cron/payroll-monthly] error:', err);
    return NextResponse.json({ error: 'The payroll job could not run. Nothing was changed by this call unless the response says so.' }, { status: 500 });
  }
}
