#!/usr/bin/env node
// Finds hr_absence_records whose stored `deductionAmount` (frozen at the
// moment the absence was detected — see runAbsenceCheck in src/lib/hrData.ts)
// no longer matches what that employee's CURRENT base salary would produce.
// This is a one-off cleanup companion to the payroll fix already shipped:
// computePayrollView and the HR payroll page no longer read this stored
// field at all (they recompute live via getAbsenceDeductionForMonth), so
// nothing here is money-urgent — payroll math is already correct. This
// script just brings the historical records themselves in line, so the
// Absent Details page (and anyone reading the raw data later) doesn't see
// stale/inflated numbers sitting next to the correct payroll totals.
//
// Usage (run from the project root, with the same env this app already
// uses for PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD — see .env.local):
//   node scripts/audit-absence-deductions.mjs              # report only, no writes
//   node scripts/audit-absence-deductions.mjs --fix         # also correct the mismatched records
//
// Requires network access to pb.delcargo.us and the `pocketbase` package
// (already a project dependency — package.json).

import fs from 'node:fs';
import path from 'node:path';
import PocketBase from 'pocketbase';

const PB_URL = 'https://pb.delcargo.us';
const WORKING_DAYS_PER_MONTH = 22; // must match src/lib/hrData.ts

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function main() {
  const fix = process.argv.includes('--fix');
  const env = { ...loadEnvLocal(), ...process.env };
  const adminEmail = env.PB_ADMIN_EMAIL;
  const adminPassword = env.PB_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    console.error('Missing PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD (checked .env.local and the environment).');
    process.exit(1);
  }

  const pb = new PocketBase(PB_URL);
  console.log('Authenticating as admin...');
  // PocketBase JS SDK >= 0.21 auths admins through the `_superusers` auth
  // collection rather than the old /api/admins endpoint.
  await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);

  console.log('Fetching employee profiles...');
  const profiles = await pb.collection('hr_profiles').getFullList({ requestKey: null });
  const byEmail = new Map(profiles.map(p => [String(p.email || '').toLowerCase(), p]));

  console.log('Fetching absence records...');
  const records = await pb.collection('hr_absence_records').getFullList({ requestKey: null });

  const mismatches = [];
  for (const r of records) {
    if (r.deleted) continue; // already reversed/removed, leave alone
    const profile = byEmail.get(String(r.employeeEmail || '').toLowerCase());
    if (!profile) {
      console.warn(`  (no matching profile for ${r.employeeEmail} — record ${r.id} on ${r.date}, skipping)`);
      continue;
    }
    const baseSalary = Number(profile.base_salary) || 0;
    const dailyRate = baseSalary / WORKING_DAYS_PER_MONTH;
    const expected = Math.round(2 * dailyRate);
    const stored = Number(r.deductionAmount) || 0;
    if (stored !== expected) {
      mismatches.push({
        id: r.id,
        employeeEmail: r.employeeEmail,
        employeeName: r.employeeName,
        date: r.date,
        stored,
        expected,
        currentBaseSalary: baseSalary,
      });
    }
  }

  if (mismatches.length === 0) {
    console.log('\nNo mismatched absence records found — every deductionAmount already matches the employee\'s current base salary.');
    return;
  }

  console.log(`\nFound ${mismatches.length} absence record(s) whose stored deduction no longer matches the employee's current salary:\n`);
  for (const m of mismatches) {
    console.log(
      `  ${m.date}  ${m.employeeName} <${m.employeeEmail}>  stored=${m.stored}  expected=${m.expected} (current base salary ${m.currentBaseSalary})  [record ${m.id}]`
    );
  }

  const totalStoredExcess = mismatches.reduce((acc, m) => acc + (m.stored - m.expected), 0);
  console.log(`\nTotal excess in stored (but no longer payroll-relevant) deduction amounts: ${totalStoredExcess}`);

  if (!fix) {
    console.log('\nDry run only — no records were changed. Re-run with --fix to correct deductionAmount on the records above.');
    return;
  }

  console.log('\nApplying fixes...');
  for (const m of mismatches) {
    await pb.collection('hr_absence_records').update(m.id, { deductionAmount: m.expected });
    console.log(`  updated ${m.id}: ${m.stored} -> ${m.expected}`);
  }
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Failed:', err?.message || err);
  process.exit(1);
});
