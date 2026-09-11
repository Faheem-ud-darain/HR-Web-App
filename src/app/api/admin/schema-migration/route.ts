import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { pbAdminFetch } from '@/lib/pbAdmin';

export const runtime = 'edge';

// Plan 027 (migrate hr_delcargo_store into dedicated collections) —
// temporary, admin-only schema/migration utility. Not a permanent part of
// the app's API surface: this exists purely so each phase's new
// PocketBase collections can be created and populated from a real
// server-side PocketBase admin session (the same one every other route in
// this app already authenticates with via pbAdmin.ts), since neither
// sandbox this was built in has direct network access to pb.delcargo.us.
// Safe to delete once plan 027 is fully done and its collections are
// stable — nothing else in the app depends on this route existing.
//
// Admin-only (not HR) — this issues real PocketBase schema changes
// (POST /api/collections), which is a materially bigger blast radius than
// the HR/Admin data routes elsewhere in this app.
async function requireAdmin(request: Request) {
  const session = await requireSession(request);
  if (!session) return { session: null, error: NextResponse.json({ error: 'Not authenticated.' }, { status: 401 }) };
  if (session.role !== 'admin') {
    return { session: null, error: NextResponse.json({ error: 'Admin only.' }, { status: 403 }) };
  }
  return { session, error: null };
}

async function collectionExists(name: string): Promise<boolean> {
  try {
    await pbAdminFetch(`/api/collections/${name}`);
    return true;
  } catch {
    return false;
  }
}

// Phase 1 collections — see plan 027. Uniform two-column shape (a unique
// lookup field + a `data` json blob) for every one of these: none of them
// need field-level querying beyond "find by this one key", so one shared
// shape keeps this migration small instead of hand-designing four schemas.
const PHASE_1_COLLECTIONS: Array<{ name: string; keyField: string }> = [
  { name: 'hr_user_sessions', keyField: 'email' }, // created here for parity/rules, though profiles.ts uses `slots` as a named field, not `data` — see note below
  { name: 'hr_password_reset_otps', keyField: 'email' },
  { name: 'hr_rate_limits', keyField: 'rate_key' },
  { name: 'hr_google_integrations', keyField: 'email' },
];

function baseSchemaFor(keyField: string, extraField: string) {
  return [
    {
      name: keyField,
      type: 'text',
      required: true,
      unique: true,
      options: { min: null, max: null, pattern: '' },
    },
    {
      name: extraField,
      type: 'json',
      required: false,
      unique: false,
      options: { maxSize: 2000000 },
    },
  ];
}

async function ensurePhase1Collections(): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  for (const { name, keyField } of PHASE_1_COLLECTIONS) {
    if (await collectionExists(name)) {
      results[name] = 'already exists';
      continue;
    }
    // hr_user_sessions stores its payload under `slots` (an array, matching
    // shared.ts's pbUpsertByField flat-field-per-key convention already
    // used by hr_tracking_settings/hr_ticket_presence); every other Phase 1
    // collection here stores its payload under a generic `data` field
    // (matching this route's/pbAdmin.ts's own adminUpsertByField
    // convention, used only by these new admin-only collections).
    const extraField = name === 'hr_user_sessions' ? 'slots' : 'data';
    // hr_user_sessions is reached directly by client-side code (profiles.ts,
    // via the plain anonymous `pb` client — same as hr_tracking_settings/
    // hr_ticket_presence today), so it keeps that same public-rule posture
    // for now rather than breaking on this migration; tightening it is
    // plan 012's job, done together with those other two collections, not
    // this plan's. The other three Phase 1 collections are reached only
    // through requireSession()-gated API routes using the admin
    // (superuser) token, which bypasses rules entirely — so restrictive
    // rules on those cost nothing functionally and correctly block any
    // hypothetical direct public REST access to session/OTP/rate-limit/
    // Google-token rows.
    const isPublic = name === 'hr_user_sessions';
    const rule = isPublic ? '' : '@request.auth.id != ""';
    await pbAdminFetch('/api/collections', {
      method: 'POST',
      body: JSON.stringify({
        name,
        type: 'base',
        schema: baseSchemaFor(keyField, extraField),
        indexes: [`CREATE UNIQUE INDEX idx_${name}_${keyField} ON ${name} (${keyField})`],
        listRule: rule,
        viewRule: rule,
        createRule: rule,
        updateRule: rule,
        deleteRule: rule,
      }),
    });
    results[name] = 'created';
  }
  return results;
}

export async function POST(request: Request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  let body: Record<string, any> = {};
  try {
    body = await request.json();
  } catch {
    // no body is fine — action defaults below
  }

  try {
    if (body.action === 'ensurePhase1Collections') {
      const results = await ensurePhase1Collections();
      return NextResponse.json({ ok: true, results });
    }
    if (body.action === 'fixUserSessionsRules') {
      // hr_user_sessions pre-existed this plan with admin-only rules
      // (listRule: null etc.) — that blocks the anonymous, client-side
      // calls profiles.ts makes (this app never produces a PocketBase-
      // recognized login; see plan 012). Bring it to the same public-rule
      // posture hr_tracking_settings/hr_ticket_presence already have,
      // rather than leaving a collection nothing can actually reach.
      const existing = await pbAdminFetch('/api/collections/hr_user_sessions');
      await pbAdminFetch(`/api/collections/${existing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '' }),
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'describePhase1Collections') {
      const results: Record<string, any> = {};
      for (const { name } of PHASE_1_COLLECTIONS) {
        try {
          const schema = await pbAdminFetch(`/api/collections/${name}`);
          results[name] = {
            fields: (schema?.schema || []).map((f: any) => ({ name: f.name, type: f.type, unique: f.unique, required: f.required })),
            indexes: schema?.indexes || [],
            listRule: schema?.listRule,
          };
        } catch (err: any) {
          results[name] = { error: String(err?.message || err) };
        }
      }
      return NextResponse.json({ ok: true, results });
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err: any) {
    console.error('[admin/schema-migration] error:', err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
