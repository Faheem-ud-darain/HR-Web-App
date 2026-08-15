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
export async function adminFindProfileByEmail(email: string): Promise<any | null> {
  const clean = email.toLowerCase().trim().replace(/"/g, '\\"');
  const encoded = encodeURIComponent(`email = "${clean}"`);
  const list = await pbAdminFetch(`/api/collections/hr_profiles/records?filter=${encoded}&perPage=1`);
  return list?.items?.[0] || null;
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
