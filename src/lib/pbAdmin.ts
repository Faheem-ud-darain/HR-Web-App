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
import { pbFilter } from '@/lib/pbFilter';
import { sanitizeForWrite } from './sanitize';
import type { PbRow, PbJson } from '@/lib/pbTypes';
import { hasDocs, legacyDocsKey, parseLegacyDocs, type ProfileDocs } from '@/lib/core/profileDocs';

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
export async function pbAdminFetch(path: string, init?: RequestInit): Promise<PbJson> {
  const token = await getAdminToken();
  // Every JSON write made on the server passes through here, so strip control/
  // spoofing characters from its strings once, centrally (see sanitizeForWrite:
  // passwords/tokens/hashes, data: URLs and huge blobs are left alone).
  if (typeof init?.body === 'string' && init.body.startsWith('{')) {
    try { init = { ...init, body: JSON.stringify(sanitizeForWrite(JSON.parse(init.body))) }; } catch { /* not JSON — send as-is */ }
  }
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
export async function adminFindProfileByEmail(email: string): Promise<PbJson | null> {
  const clean = email.toLowerCase().trim();
  const encoded = encodeURIComponent(pbFilter('email ~ {:email}', { email: clean }));
  const list = await pbAdminFetch(`/api/collections/hr_profiles/records?filter=${encoded}&perPage=20`);
  const items: PbRow[] = list?.items || [];
  return items.find((p) => (p.email || '').toLowerCase().trim() === clean) || null;
}

export async function adminGetKV(key: string): Promise<{ id: string; value: PbJson } | null> {
  const encoded = encodeURIComponent(pbFilter('key = {:key}', { key }));
  const list = await pbAdminFetch(`/api/collections/hr_delcargo_store/records?filter=${encoded}&perPage=1`);
  const item = list?.items?.[0];
  return item ? { id: item.id, value: item.value } : null;
}

// One employee's onboarding documents: the row in hr_profile_docs, or, for anyone whose documents pre-date that
// collection, the old key-value row (see core/profileDocs). Used wherever the server reads or merges documents, so an
// old upload is never lost when a new file is saved next to it.
export async function adminGetProfileDocs(profileId: string): Promise<PbRow> {
  const row = await adminFindByField('hr_profile_docs', 'profile_id', profileId);
  if (hasDocs(row?.data as ProfileDocs)) return row!.data as PbRow;
  const legacy = await adminGetKV(legacyDocsKey(profileId));
  return parseLegacyDocs(legacy?.value) as PbRow;
}

export async function adminUpdateProfile(profileId: string, fields: PbRow): Promise<void> {
  await pbAdminFetch(`/api/collections/hr_profiles/records/${profileId}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

export async function adminListPayrollForEmployee(employeeId: string): Promise<PbRow[]> {
  const encoded = encodeURIComponent(pbFilter('employee_id = {:employeeId}', { employeeId }));
  const list = await pbAdminFetch(`/api/collections/hr_payroll/records?filter=${encoded}&perPage=50&sort=-created`);
  return list?.items || [];
}

// Deletes every hr_payroll row belonging to one employee — used by
// hrData.ts's deleteEmployee purge flow (was previously a direct public
// pbList+pbDelete pair; now needed here since hr_payroll's PocketBase rules
// are locked to admins-only, plan 012 Phase 1).
export async function adminDeletePayrollForEmployee(employeeId: string): Promise<void> {
  const rows = await adminListPayrollForEmployee(employeeId);
  await Promise.allSettled(rows.map((r: PbRow) => pbAdminFetch(`/api/collections/hr_payroll/records/${r.id}`, { method: 'DELETE' })));
}

// Upsert into the hr_delcargo_store KV collection — mirrors setKvRecord in
// src/lib/passwordResetOtp.ts, just authenticated with the admin token
// instead of relying on hr_delcargo_store staying public.
export async function adminSetKV(key: string, value: PbJson): Promise<void> {
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

/** Every row of a collection matching `query` (extra URL parameters such as `sort=` or `fields=`), paged, read-only. */
export async function adminListAll(collection: string, query = '', maxPages = 10): Promise<PbRow[]> {
  const out: PbRow[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const list = await pbAdminFetch(`/api/collections/${collection}/records?perPage=500&page=${page}${query ? `&${query}` : ''}`);
    const items: PbRow[] = list?.items || [];
    out.push(...items);
    if (items.length < 500) break;
  }
  return out;
}

export async function adminListAllProfiles(): Promise<PbRow[]> {
  // hr_profiles is small enough (employee headcount, not a big-data table)
  // that a single bounded page comfortably covers the whole company — same
  // 500-row ceiling already used elsewhere in this app (see useTimesheets in
  // hrData.ts) rather than paginating through getFullList-style unbounded
  // reads.
  const list = await pbAdminFetch(`/api/collections/hr_profiles/records?perPage=500&sort=full_name`);
  return list?.items || [];
}

export async function adminListAllPayroll(): Promise<PbRow[]> {
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
const SCREENSHOT_LIST_CAP = 5000;
const SCREENSHOT_FIELDS = 'id,collectionId,employee_email,captured_at,image,device_label';
export const SCREENSHOT_PAGE_SIZE = 50;

type ScreenshotFilters = { employeeEmail?: string; sinceISO?: string; untilISO?: string };

function screenshotFilter(filters?: ScreenshotFilters): string {
  const parts: string[] = [];
  const toPbDate = (iso: string) => iso.replace('T', ' ').replace('Z', '');
  if (filters?.employeeEmail) parts.push(pbFilter('employee_email ~ {:email}', { email: filters.employeeEmail }));
  if (filters?.sinceISO) parts.push(pbFilter('captured_at >= {:since}', { since: toPbDate(filters.sinceISO) }));
  if (filters?.untilISO) parts.push(pbFilter('captured_at <= {:until}', { until: toPbDate(filters.untilISO) }));
  return parts.join(' && ');
}

// `~` is a case-insensitive "contains" — drop substring false-matches.
function exactEmailOnly(items: PbRow[], employeeEmail?: string): PbRow[] {
  if (!employeeEmail) return items;
  const wanted = employeeEmail.toLowerCase();
  return items.filter((r) => (r.employee_email || '').toLowerCase() === wanted);
}

// ONE page of a window (newest first) for the viewer: a single PocketBase
// request of at most `perPage` rows plus the window's total, so opening a
// month with 1,000+ captures only loads 50 at a time. Backed by the
// (employee_email, captured_at) / captured_at indexes — see
// ensureScreenshotIndexes in the schema-migration route.
export async function adminListScreenshotsPage(
  filters: ScreenshotFilters,
  page = 1,
  perPage = SCREENSHOT_PAGE_SIZE,
): Promise<{ items: PbRow[]; page: number; perPage: number; totalItems: number; totalPages: number }> {
  const safePerPage = Math.min(Math.max(1, perPage), SCREENSHOT_PAGE_SIZE);
  const filter = screenshotFilter(filters);
  const res = await pbAdminFetch(
    `/api/collections/hr_screenshots/records?page=${Math.max(1, page)}&perPage=${safePerPage}&sort=-captured_at&fields=${SCREENSHOT_FIELDS}`
      + (filter ? `&filter=${encodeURIComponent(filter)}` : ''),
  );
  return {
    items: exactEmailOnly(res?.items || [], filters.employeeEmail),
    page: res?.page ?? page,
    perPage: safePerPage,
    totalItems: res?.totalItems ?? 0,
    totalPages: res?.totalPages ?? 1,
  };
}

// The WHOLE window (capped at SCREENSHOT_LIST_CAP), for the flows that really
// need everything: ZIP export, the profile download/purge and the monthly
// retention sweep. Never used for the interactive viewer.
export async function adminListScreenshots(filters?: ScreenshotFilters): Promise<PbRow[]> {
  const filter = screenshotFilter(filters);
  const base = `perPage=200&skipTotal=1&sort=-captured_at&fields=${SCREENSHOT_FIELDS}`
    + (filter ? `&filter=${encodeURIComponent(filter)}` : '');
  const all: PbRow[] = [];
  for (let page = 1; all.length < SCREENSHOT_LIST_CAP; page++) {
    const res = await pbAdminFetch(`/api/collections/hr_screenshots/records?page=${page}&${base}`);
    const batch: PbRow[] = res?.items || [];
    all.push(...batch);
    if (batch.length < 200) break;
  }
  return exactEmailOnly(all, filters?.employeeEmail);
}

// Authenticated KV-prefix scan (the browser-side equivalent was removed). Used
// for the legacy base64-in-KV screenshot rows (key prefix `screenshot_`,
// predates the real hr_screenshots collection — see getScreenshots' comment)
// so the authenticated route below can return the exact same combined
// result the old public client-side call used to.
export async function adminGetKVByPrefix(prefix: string): Promise<{ key: string; value: PbJson; id: string }[]> {
  const encoded = encodeURIComponent(pbFilter('key ~ {:prefix}', { prefix }));
  const list = await pbAdminFetch(`/api/collections/hr_delcargo_store/records?filter=${encoded}&perPage=500`);
  return (list?.items || []).map((r: PbRow) => ({ key: r.key, value: r.value, id: r.id }));
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
export async function adminListTrackingSettings(): Promise<PbRow[]> {
  const list = await pbAdminFetch(`/api/collections/hr_tracking_settings/records?perPage=500`);
  return (list?.items || []).map((t: PbRow) => ({
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
  // The in-app bell always gets every notification; opt-outs only stop push (see hr/notificationPrefs.ts).
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

export async function adminFindByField(collection: string, field: string, value: string): Promise<{ id: string; data: PbJson } | null> {
  const encoded = encodeURIComponent(pbFilter(`${field} = {:value}`, { value }));
  const list = await pbAdminFetch(`/api/collections/${collection}/records?filter=${encoded}&perPage=1`);
  const item = list?.items?.[0];
  return item ? { id: item.id, data: item.data } : null;
}

// Lets a caller that has JUST looked a row up tell adminUpsertByField its id, so the upsert that
// follows is one PATCH instead of a second lookup + PATCH (each round trip to the database is
// ~0.5–0.7 s from the edge, so this matters on the login path).
export function rememberAdminUpsertId(collection: string, field: string, value: string, id: string): void {
  adminUpsertIdCache.set(`${collection}:${field}:${value.toLowerCase()}`, id);
}

export async function adminUpsertByField(collection: string, field: string, value: string, data: PbJson): Promise<void> {
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
export async function adminListCareerApplications(): Promise<PbRow[]> {
  const list = await pbAdminFetch(`/api/collections/hr_career_applications/records?perPage=500&sort=-created`);
  return list?.items || [];
}

// Anti-spam guard, same (position, email) pair check the old public client
// call did — just authenticated now so the collection's List rule can be
// locked down without breaking this check.
export async function adminHasAppliedForPosition(positionId: string, email: string): Promise<boolean> {
  const encoded = encodeURIComponent(pbFilter('position_id = {:positionId} && applicant_email = {:email}', { positionId, email: email.trim().toLowerCase() }));
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
export async function adminListCareerApplicationsForEmail(email: string): Promise<PbRow[]> {
  const encoded = encodeURIComponent(pbFilter('applicant_email ~ {:email}', { email }));
  const list = await pbAdminFetch(`/api/collections/hr_career_applications/records?filter=${encoded}&sort=-created`);
  const wanted = email.trim().toLowerCase();
  return (list?.items || []).filter((r: PbRow) => (r.applicant_email || '').toLowerCase() === wanted);
}

// Purge every application submitted under one email — used only by
// hrActions.deleteEmployee's permanent-delete flow (an ex-employee who
// once applied through the public Careers form under their own address,
// before being hired). Best-effort per row, same as adminDeleteRecords.
export async function adminDeleteCareerApplicationsForEmail(email: string): Promise<void> {
  const rows = await adminListCareerApplicationsForEmail(email);
  await Promise.allSettled(rows.map((r: PbRow) => pbAdminFetch(`/api/collections/hr_career_applications/records/${r.id}`, { method: 'DELETE' })));
}

// Employee's own absence/deduction records (hr_absence_records) — for the
// authenticated /api/absences/me route. Scoped by employeeEmail using the
// same case-insensitive `~` + exact-match-filter pattern used elsewhere in
// this file (see adminListScreenshots), since PocketBase's `=` filter is
// case-sensitive and emails have drifted in casing before.
export async function adminListAbsenceRecordsForEmail(email: string): Promise<PbRow[]> {
  const encoded = encodeURIComponent(pbFilter('employeeEmail ~ {:email} && deleted = false', { email }));
  const list = await pbAdminFetch(`/api/collections/hr_absence_records/records?filter=${encoded}&perPage=200&sort=-date`);
  const wanted = email.toLowerCase();
  return (list?.items || []).filter((r: PbRow) => (r.employeeEmail || '').toLowerCase() === wanted);
}
