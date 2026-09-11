// Server-only PocketBase admin (superuser) client. NEVER import this from
// any 'use client' file or anything that ends up in the browser bundle —
// it authenticates with real PocketBase admin credentials
// (PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD, server-only env vars) and every
// caller gets a token with full read/write access to every collection,
// including ones that get their public API rules locked down.
//
// This exists so that once hr_profiles/hr_payroll (etc.) move from "open to
// anyone with the URL" to "Admins Only" in the PocketBase Admin UI, the app
// doesn't just stop working — these specific server-side routes
// (src/app/api/auth/login, src/app/api/payroll/me) keep working because
// they authenticate as a real PocketBase admin, server-side, where the
// credentials never reach the browser. The plain public `pb` client in
// src/lib/pocketbase.ts (used by hrData.ts) is unaffected by any of this —
// it still just does anonymous requests, same as always, and will start
// getting 403s from PocketBase on any collection you actually lock down
// (which is the point — see the PocketBase rules note in that migration).
//
// Written for PocketBase v0.22.x's admin auth endpoint (/api/admins/...) —
// this matches the same version note already called out in
// pb_hooks/push_notifications.pb.js. If PocketBase is ever upgraded past
// v0.23, this endpoint becomes /api/collections/_superusers/auth-with-password
// instead — see https://pocketbase.io/v023upgrade for the full mapping.

import { formatDateNY, formatTimeNY } from '@/lib/timezone';

const PB_URL = process.env.NEXT_PUBLIC_PB_URL || 'https://pb.delcargo.us';

// Cached in a module-level variable — on Cloudflare's Edge runtime this can
// persist across requests within the same warm isolate, which saves a
// round-trip admin re-auth on every single request (one more small win for
// droplet load, in the same spirit as everything else this session's been
// doing). Correctness doesn't depend on the cache surviving, though — a
// cold isolate with no cached token just re-authenticates once, no
// different from any other API call.
let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;

async function getAdminToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt) return cachedToken;

  const email = process.env.PB_ADMIN_EMAIL;
  const password = process.env.PB_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD are not configured — server-side PocketBase admin access is unavailable. ' +
      'Set both in your deployment environment (see .env.example).'
    );
  }

  const res = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PocketBase admin auth failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  cachedToken = data.token;
  // PocketBase admin tokens default to a multi-day lifetime, but re-auth
  // well before that (30 min) — an isolate rarely stays warm anywhere near
  // that long anyway, and a shorter cache window means a rotated admin
  // password takes effect quickly instead of an old cached token lingering.
  cachedTokenExpiresAt = now + 30 * 60 * 1000;
  return cachedToken as string;
}

// Generic authenticated PocketBase REST call. `path` is anything after the
// base URL, e.g. `/api/collections/hr_profiles/records?filter=...`.
export async function pbAdminFetch(path: string, init?: RequestInit): Promise<any> {
  const token = await getAdminToken();
  const res = await fetch(`${PB_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PocketBase ${path} failed: ${res.status} ${body}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Fetch a single hr_profiles record by email (case-insensitive), including
// every field — callers decide what's safe to forward to the client.
// Returns null if no match.
//
// This used to filter with an exact `email = "<lowercased>"` match, which
// silently failed for any profile whose email was ever saved with mixed
// case (e.g. "Faheem@delcargo.us" — entered that way once through the HR
// "Edit Employee" form, which doesn't normalize casing on save). PocketBase's
// "=" filter is a plain SQLite comparison, which is case-sensitive, so a
// lowercased login attempt against a mixed-case stored email silently
// returned zero rows — profile ends up null, and the login route reports
// the generic "Invalid email or password.", identical to a genuinely wrong
// password. There was no way to tell the two apart from the login response.
//
// Fixed by using "~" (PocketBase's case-insensitive "contains" operator) to
// fetch candidates, then resolving to the exact address in JS — this is
// robust regardless of stored casing, and the JS-side equality check after
// the fetch prevents a false match on some other profile whose email merely
// contains this address as a substring.
export async function adminFindProfileByEmail(email: string): Promise<any | null> {
  const clean = email.toLowerCase().trim();
  const escaped = clean.replace(/"/g, '\\"');
  const encoded = encodeURIComponent(`email ~ "${escaped}"`);
  const list = await pbAdminFetch(`/api/collections/hr_profiles/records?filter=${encoded}&perPage=20`);
  const items: any[] = list?.items || [];
  return items.find((p) => (p.email || '').toLowerCase().trim() === clean) || null;
}

export async function adminGetKV(key: string): Promise<{ id: string; value: any } | null> {
  const encoded = encodeURIComponent(`key = "${key.replace(/"/g, '\\"')}"`);
  const list = await pbAdminFetch(`/api/collections/hr_delcargo_store/records?filter=${encoded}&perPage=1`);
  const item = list?.items?.[0];
  return item ? { id: item.id, value: item.value } : null;
}

export async function adminUpdateProfile(profileId: string, fields: Record<string, any>): Promise<void> {
  await pbAdminFetch(`/api/collections/hr_profiles/records/${profileId}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

export async function adminListPayrollForEmployee(employeeId: string): Promise<any[]> {
  const encoded = encodeURIComponent(`employee_id = "${employeeId.replace(/"/g, '\\"')}"`);
  const list = await pbAdminFetch(`/api/collections/hr_payroll/records?filter=${encoded}&perPage=50&sort=-created`);
  return list?.items || [];
}

// Deletes every hr_payroll row belonging to one employee — used by
// hrData.ts's deleteEmployee purge flow (was previously a direct public
// pbList+pbDelete pair; now needed here since hr_payroll's PocketBase rules
// are locked to admins-only, plan 012 Phase 1).
export async function adminDeletePayrollForEmployee(employeeId: string): Promise<void> {
  const rows = await adminListPayrollForEmployee(employeeId);
  await Promise.allSettled(rows.map((r: any) => pbAdminFetch(`/api/collections/hr_payroll/records/${r.id}`, { method: 'DELETE' })));
}

// Upsert into the hr_delcargo_store KV collection — mirrors setKvRecord in
// src/lib/passwordResetOtp.ts, just authenticated with the admin token
// instead of relying on hr_delcargo_store staying public.
export async function adminSetKV(key: string, value: any): Promise<void> {
  const existing = await adminGetKV(key);
  if (existing) {
    await pbAdminFetch(`/api/collections/hr_delcargo_store/records/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    });
  } else {
    await pbAdminFetch(`/api/collections/hr_delcargo_store/records`, {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    });
  }
}

// Uploads a profile picture as a real PocketBase file (multipart) into
// profile_picture_file — server-side equivalent of hrActions.uploadProfilePicture
// in hrData.ts. `dataUrl` is a `data:image/webp;base64,...` string (already
// compressed client-side before it reaches this route); an empty string
// clears the picture, matching the same convention as the client version.
export async function adminUploadProfilePicture(profileId: string, dataUrl: string): Promise<void> {
  const token = await getAdminToken();
  const formData = new FormData();
  if (!dataUrl) {
    formData.append('profile_picture_file', '');
  } else {
    const blob = await (await fetch(dataUrl)).blob();
    formData.append('profile_picture_file', blob, `profile_${profileId}.webp`);
  }
  const res = await fetch(`${PB_URL}/api/collections/hr_profiles/records/${profileId}`, {
    method: 'PATCH',
    headers: { Authorization: token },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Profile picture upload failed: ${res.status} ${body}`);
  }
}

export async function adminListAllProfiles(): Promise<any[]> {
  // hr_profiles is small enough (employee headcount, not a big-data table)
  // that a single bounded page comfortably covers the whole company — same
  // 500-row ceiling already used elsewhere in this app (see useTimesheets in
  // hrData.ts) rather than paginating through getFullList-style unbounded
  // reads.
  const list = await pbAdminFetch(`/api/collections/hr_profiles/records?perPage=500&sort=full_name`);
  return list?.items || [];
}

export async function adminListAllPayroll(): Promise<any[]> {
  const list = await pbAdminFetch(`/api/collections/hr_payroll/records?perPage=500&sort=-created`);
  return list?.items || [];
}

// ── hr_screenshots (added as part of the PocketBase public-access audit,
// 2026-09-07) ────────────────────────────────────────────────────────────
// Server-side equivalent of hrActions.getScreenshots' "fresh" (real
// collection) branch in hrData.ts — same case-insensitive email narrowing
// (`~` server-side, exact check client-side-equivalent here) and date-range
// filtering, just authenticated so hr_screenshots' List/View rules can be
// locked down without breaking the Tracking page or the retention sweep.
export async function adminListScreenshots(filters?: { employeeEmail?: string; sinceISO?: string; untilISO?: string }): Promise<any[]> {
  const filterParts: string[] = [];
  if (filters?.employeeEmail) filterParts.push(`employee_email ~ "${filters.employeeEmail.replace(/"/g, '\\"')}"`);
  if (filters?.sinceISO) filterParts.push(`captured_at >= "${filters.sinceISO.replace('T', ' ').replace('Z', '')}"`);
  if (filters?.untilISO) filterParts.push(`captured_at <= "${filters.untilISO.replace('T', ' ').replace('Z', '')}"`);
  const query = filterParts.length ? `?filter=${encodeURIComponent(filterParts.join(' && '))}&perPage=500&sort=-captured_at` : '?perPage=500&sort=-captured_at';
  const list = await pbAdminFetch(`/api/collections/hr_screenshots/records${query}`);
  let items: any[] = list?.items || [];
  if (filters?.employeeEmail) {
    const wanted = filters.employeeEmail.toLowerCase();
    items = items.filter((r) => (r.employee_email || '').toLowerCase() === wanted);
  }
  return items;
}

// Same KV-prefix scan as pbGetKVByPrefix in hrData.ts, authenticated. Used
// for the legacy base64-in-KV screenshot rows (key prefix `screenshot_`,
// predates the real hr_screenshots collection — see getScreenshots' comment)
// so the authenticated route below can return the exact same combined
// result the old public client-side call used to.
export async function adminGetKVByPrefix(prefix: string): Promise<{ key: string; value: any; id: string }[]> {
  const encoded = encodeURIComponent(`key ~ "${prefix}"`);
  const list = await pbAdminFetch(`/api/collections/hr_delcargo_store/records?filter=${encoded}&perPage=500`);
  return (list?.items || []).map((r: any) => ({ key: r.key, value: r.value, id: r.id }));
}

export async function adminDeleteRecords(collection: string, ids: string[]): Promise<void> {
  await Promise.allSettled(
    ids.map((id) => pbAdminFetch(`/api/collections/${collection}/records/${id}`, { method: 'DELETE' }))
  );
}

// Mints a short-lived PocketBase file token (superuser-authenticated) for
// downloading a *protected* file field without the collection's View rule
// needing to allow public reads — see https://pocketbase.io/docs/files-upload-and-handling/#file-token.
// hr_screenshots' `image` field is marked protected as part of this same
// audit (raw file URLs were downloadable by anyone who guessed a record
// id + filename even with List/View locked down, since an unprotected file
// field is served with no rule check at all).
export async function adminGetFileToken(): Promise<string> {
  const token = await getAdminToken();
  const res = await fetch(`${PB_URL}/api/files/token`, {
    method: 'POST',
    headers: { Authorization: token },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PocketBase file token request failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.token;
}

export function adminFileUrl(collectionId: string, recordId: string, filename: string, fileToken: string): string {
  return `${PB_URL}/api/files/${collectionId}/${recordId}/${filename}?token=${encodeURIComponent(fileToken)}`;
}

// Authenticated mirror of hrActions.getAllTrackingSettings — used by the
// screenshot-retention route to know which employees are excluded from
// auto-delete.
export async function adminListTrackingSettings(): Promise<any[]> {
  const list = await pbAdminFetch(`/api/collections/hr_tracking_settings/records?perPage=500`);
  return (list?.items || []).map((t: any) => ({
    employeeEmail: t.employeeEmail, enabled: !!t.enabled, intervalMinutes: t.intervalMinutes,
    excludeFromAutoDelete: !!t.excludeFromAutoDelete, agentToken: t.agentToken, id: t.id,
  }));
}

// Authenticated mirror of hrActions.addNotification. Uses a plain ISO
// timestamp rather than formatTimeNY's human-readable NY-local string
// (that helper isn't Edge-safe to import here) — same simplification
// already accepted elsewhere in this server-side migration, since every
// notification consumer prefers PocketBase's own `created` field for
// display/sorting anyway.
export async function adminAddNotification(
  email: string, role: string, message: string, category?: string, pushTitle?: string, senderEmail?: string, link?: string,
): Promise<void> {
  await pbAdminFetch(`/api/collections/hr_notifications/records`, {
    method: 'POST',
    body: JSON.stringify({
      recipient_email: email, recipient_role: role, message, read: false,
      category: category || 'internal', push_title: pushTitle || '', sender_email: senderEmail || '',
      link: link || '', timestamp: new Date().toISOString(),
    }),
  });
}

// Authenticated mirror of pbDeleteKVByKeys in hrData.ts (find-by-key then
// delete-by-id, best-effort per key).
export async function adminDeleteKVByKeys(keys: string[]): Promise<void> {
  await Promise.allSettled(keys.map(async (key) => {
    const row = await adminGetKV(key);
    if (row) await pbAdminFetch(`/api/collections/hr_delcargo_store/records/${row.id}`, { method: 'DELETE' });
  }));
}

// ── Plan 027: server-side upsert-by-field helpers ───────────────────────
// Admin-authenticated mirror of shared.ts's pbUpsertByField/pbFindByField
// (same "find the one row where `field` = `value`, update it; otherwise
// create" shape, same in-memory id cache to skip the lookup round trip on
// repeat writes), for the real per-entity collections that are replacing
// hr_delcargo_store's server-only key patterns (sessions, OTPs, rate
// limits, Google integration tokens — see plan 027). Every one of these
// new collections uses the same two-column shape (a unique lookup field
// plus a `data` json column), so one generic pair of helpers covers all
// of them rather than writing four near-identical ones.
const adminUpsertIdCache = new Map<string, string>();

export async function adminFindByField(collection: string, field: string, value: string): Promise<{ id: string; data: any } | null> {
  const escaped = value.replace(/"/g, '\\"');
  const encoded = encodeURIComponent(`${field} = "${escaped}"`);
  const list = await pbAdminFetch(`/api/collections/${collection}/records?filter=${encoded}&perPage=1`);
  const item = list?.items?.[0];
  return item ? { id: item.id, data: item.data } : null;
}

export async function adminUpsertByField(collection: string, field: string, value: string, data: any): Promise<void> {
  const cacheKey = `${collection}:${field}:${value.toLowerCase()}`;
  const cachedId = adminUpsertIdCache.get(cacheKey);
  if (cachedId) {
    try {
      await pbAdminFetch(`/api/collections/${collection}/records/${cachedId}`, { method: 'PATCH', body: JSON.stringify({ data }) });
      return;
    } catch {
      adminUpsertIdCache.delete(cacheKey);
    }
  }
  const existing = await adminFindByField(collection, field, value);
  if (existing) {
    adminUpsertIdCache.set(cacheKey, existing.id);
    await pbAdminFetch(`/api/collections/${collection}/records/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ data }) });
  } else {
    const created = await pbAdminFetch(`/api/collections/${collection}/records`, {
      method: 'POST',
      body: JSON.stringify({ [field]: value, data }),
    });
    adminUpsertIdCache.set(cacheKey, created.id);
  }
}

export async function adminDeleteByField(collection: string, field: string, value: string): Promise<void> {
  const cacheKey = `${collection}:${field}:${value.toLowerCase()}`;
  adminUpsertIdCache.delete(cacheKey);
  const existing = await adminFindByField(collection, field, value);
  if (existing) await pbAdminFetch(`/api/collections/${collection}/records/${existing.id}`, { method: 'DELETE' });
}

// ── hr_career_applications (plan 012, Phase 1) — applicant PII (name,
// email, cover letter) that used to be fully public. Job applicants never
// log in at all, so unlike every other collection here this is fronted by
// a public (no-session) API route (src/app/api/careers/apply) rather than
// requireSession() — the route itself is the trust boundary instead, and
// it's the only caller of adminCreateCareerApplication /
// adminHasAppliedForPosition. Listing and status changes stay HR/Admin-only
// via src/app/api/admin/careers/applications, same requireSession()
// pattern as everything else in this file.
export async function adminListCareerApplications(): Promise<any[]> {
  const list = await pbAdminFetch(`/api/collections/hr_career_applications/records?perPage=500&sort=-created`);
  return list?.items || [];
}

// Anti-spam guard, same (position, email) pair check the old public client
// call did — just authenticated now so the collection's List rule can be
// locked down without breaking this check.
export async function adminHasAppliedForPosition(positionId: string, email: string): Promise<boolean> {
  const safePos = positionId.replace(/"/g, '\\"');
  const safeEmail = email.trim().toLowerCase().replace(/"/g, '\\"');
  const encoded = encodeURIComponent(`position_id = "${safePos}" && applicant_email = "${safeEmail}"`);
  const list = await pbAdminFetch(`/api/collections/hr_career_applications/records?filter=${encoded}`);
  return (list?.items || []).length > 0;
}

export async function adminCreateCareerApplication(app: {
  positionId: string; positionTitle: string; applicantName: string; applicantEmail: string; coverLetter: string;
}): Promise<void> {
  await pbAdminFetch(`/api/collections/hr_career_applications/records`, {
    method: 'POST',
    body: JSON.stringify({
      position_id: app.positionId, position_title: app.positionTitle, applicant_name: app.applicantName,
      applicant_email: app.applicantEmail.trim().toLowerCase(), phone: '', cover_letter: app.coverLetter, resume_url: '',
      status: 'pending', submitted_at: formatDateNY(new Date()) + ' ' + formatTimeNY(new Date()),
    }),
  });
}

export async function adminUpdateCareerApplicationStatus(id: string, status: string): Promise<void> {
  await pbAdminFetch(`/api/collections/hr_career_applications/records/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// One employee's own past applications (used by exportEmployeeArchive's
// "Download Archive" HR/Admin action, via /api/admin/careers/applications
// ?email=... — that route is the only caller). Same case-insensitive `~` +
// exact-match-filter pattern as adminListAbsenceRecordsForEmail, since
// PocketBase's `=` filter is case-sensitive.
export async function adminListCareerApplicationsForEmail(email: string): Promise<any[]> {
  const encoded = encodeURIComponent(`applicant_email ~ "${email.replace(/"/g, '\\"')}"`);
  const list = await pbAdminFetch(`/api/collections/hr_career_applications/records?filter=${encoded}&sort=-created`);
  const wanted = email.trim().toLowerCase();
  return (list?.items || []).filter((r: any) => (r.applicant_email || '').toLowerCase() === wanted);
}

// Purge every application submitted under one email — used only by
// hrActions.deleteEmployee's permanent-delete flow (an ex-employee who
// once applied through the public Careers form under their own address,
// before being hired). Best-effort per row, same as adminDeleteRecords.
export async function adminDeleteCareerApplicationsForEmail(email: string): Promise<void> {
  const rows = await adminListCareerApplicationsForEmail(email);
  await Promise.allSettled(rows.map((r: any) => pbAdminFetch(`/api/collections/hr_career_applications/records/${r.id}`, { method: 'DELETE' })));
}

// Employee's own absence/deduction records (hr_absence_records) — for the
// authenticated /api/absences/me route. Scoped by employeeEmail using the
// same case-insensitive `~` + exact-match-filter pattern used elsewhere in
// this file (see adminListScreenshots), since PocketBase's `=` filter is
// case-sensitive and emails have drifted in casing before.
export async function adminListAbsenceRecordsForEmail(email: string): Promise<any[]> {
  const encoded = encodeURIComponent(`employeeEmail ~ "${email.replace(/"/g, '\\"')}" && deleted = false`);
  const list = await pbAdminFetch(`/api/collections/hr_absence_records/records?filter=${encoded}&perPage=200&sort=-date`);
  const wanted = email.toLowerCase();
  return (list?.items || []).filter((r: any) => (r.employeeEmail || '').toLowerCase() === wanted);
}
