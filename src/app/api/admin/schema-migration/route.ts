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

// Phase 2 collections — profile overlays (see plan 027). Three of these
// are reached by client-side code (profiles.ts, anonymous pb client) so
// they stay public, matching hr_profile_extra_*/hr_profile_docs_*/
// hr_deleted_profile_emails_v1's own current exposure in hr_delcargo_store
// today (tightening is plan 012's job). hr_payroll_breakdowns is reached
// only through requireSession()-gated server routes, so it's admin-only
// from creation, like the rest of Phase 1's admin-only collections.
const PHASE_2_COLLECTIONS: Array<{ name: string; keyField: string; extraField: string; extraType: 'json' | 'text'; public: boolean }> = [
  { name: 'hr_profile_extras', keyField: 'profile_id', extraField: 'data', extraType: 'json', public: true },
  { name: 'hr_profile_docs', keyField: 'profile_id', extraField: 'data', extraType: 'json', public: true },
  { name: 'hr_deleted_profile_emails', keyField: 'email', extraField: 'deletedAt', extraType: 'text', public: true },
  { name: 'hr_payroll_breakdowns', keyField: 'breakdown_key', extraField: 'data', extraType: 'json', public: false },
];

function phase2SchemaFor(extraField: string, extraType: 'json' | 'text', keyField: string) {
  return [
    { name: keyField, type: 'text', required: true, unique: true, options: { min: null, max: null, pattern: '' } },
    extraType === 'json'
      ? { name: extraField, type: 'json', required: false, unique: false, options: { maxSize: 2000000 } }
      : { name: extraField, type: 'text', required: false, unique: false, options: { min: null, max: null, pattern: '' } },
  ];
}

async function ensurePhase2Collections(): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  for (const { name, keyField, extraField, extraType, public: isPublic } of PHASE_2_COLLECTIONS) {
    if (await collectionExists(name)) {
      results[name] = 'already exists';
      continue;
    }
    const rule = isPublic ? '' : '@request.auth.id != ""';
    await pbAdminFetch('/api/collections', {
      method: 'POST',
      body: JSON.stringify({
        name,
        type: 'base',
        schema: phase2SchemaFor(extraField, extraType, keyField),
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


// Phase 3 collections — shared read-state (see plan 027). Five of these
// are "read receipt" collections (one row per entity+reader — see
// shared.ts's pbGetReadMap/pbMarkRead for why this shape replaces the old
// shared-blob-map race): a unique `read_key` composite plus plain
// `entity_id`/`email` columns so pbGetReadMap can reconstruct the exact
// `Record<entityId, string[]>` shape every UI call site already expects.
// The other three are small dedicated collections: hr_notification_prefs
// (per-email prefs blob), hr_maintenance_notices (now a real one-row-per-
// notice collection instead of an array blob), and hr_ticket_closed_at
// (per-ticket closed-at timestamp, replacing the old timer map). All are
// reached by this app's anonymous client-side `pb` calls today (same
// exposure hr_delcargo_store itself had), so all stay public — tightening
// is plan 012's job, not this plan's.
const READ_RECEIPT_COLLECTIONS = [
  'hr_notification_reads',
  'hr_notification_cleared',
  'hr_announcement_reads',
  'hr_message_reads',
  'hr_maintenance_notice_reads',
];

function readReceiptSchema() {
  return [
    { name: 'read_key', type: 'text', required: true, unique: true, options: { min: null, max: null, pattern: '' } },
    { name: 'entity_id', type: 'text', required: true, unique: false, options: { min: null, max: null, pattern: '' } },
    { name: 'email', type: 'text', required: true, unique: false, options: { min: null, max: null, pattern: '' } },
  ];
}

const PHASE_3_OTHER_COLLECTIONS: Array<{ name: string; schema: any[]; indexes: string[] }> = [
  {
    name: 'hr_notification_prefs',
    schema: [
      { name: 'email', type: 'text', required: true, unique: true, options: { min: null, max: null, pattern: '' } },
      { name: 'data', type: 'json', required: false, unique: false, options: { maxSize: 2000000 } },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_hr_notification_prefs_email ON hr_notification_prefs (email)'],
  },
  {
    name: 'hr_maintenance_notices',
    schema: [
      { name: 'title', type: 'text', required: true, unique: false, options: { min: null, max: null, pattern: '' } },
      { name: 'message', type: 'text', required: true, unique: false, options: { min: null, max: null, pattern: '' } },
      { name: 'start_at', type: 'text', required: false, unique: false, options: { min: null, max: null, pattern: '' } },
      { name: 'end_at', type: 'text', required: false, unique: false, options: { min: null, max: null, pattern: '' } },
      { name: 'created_by', type: 'text', required: false, unique: false, options: { min: null, max: null, pattern: '' } },
    ],
    indexes: [],
  },
  {
    name: 'hr_ticket_closed_at',
    schema: [
      { name: 'ticket_id', type: 'text', required: true, unique: true, options: { min: null, max: null, pattern: '' } },
      { name: 'closed_at', type: 'text', required: false, unique: false, options: { min: null, max: null, pattern: '' } },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_hr_ticket_closed_at_ticket_id ON hr_ticket_closed_at (ticket_id)'],
  },
];

async function ensurePhase3Collections(): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  for (const name of READ_RECEIPT_COLLECTIONS) {
    if (await collectionExists(name)) {
      results[name] = 'already exists';
      continue;
    }
    await pbAdminFetch('/api/collections', {
      method: 'POST',
      body: JSON.stringify({
        name,
        type: 'base',
        schema: readReceiptSchema(),
        indexes: [`CREATE UNIQUE INDEX idx_${name}_read_key ON ${name} (read_key)`],
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
      }),
    });
    results[name] = 'created';
  }
  for (const { name, schema, indexes } of PHASE_3_OTHER_COLLECTIONS) {
    if (await collectionExists(name)) {
      results[name] = 'already exists';
      continue;
    }
    await pbAdminFetch('/api/collections', {
      method: 'POST',
      body: JSON.stringify({
        name,
        type: 'base',
        schema,
        indexes,
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
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
    if (body.action === 'makeCollectionPublic') {
      // Generalized version of fixUserSessionsRules above, for any other
      // pre-existing collection discovered mid-phase with leftover
      // admin-only rules that actually needs to be reachable by this
      // app's anonymous client-side code (e.g. hr_profile_docs in Phase 2 —
      // same root cause as hr_user_sessions in Phase 1).
      const name = body.collection;
      if (typeof name !== 'string' || !name) {
        return NextResponse.json({ error: 'body.collection is required.' }, { status: 400 });
      }
      const existing = await pbAdminFetch(`/api/collections/${name}`);
      await pbAdminFetch(`/api/collections/${existing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '' }),
      });
      return NextResponse.json({ ok: true, collection: name });
    }
    if (body.action === 'ensurePhase2Collections') {
      const results = await ensurePhase2Collections();
      return NextResponse.json({ ok: true, results });
    }
    if (body.action === 'ensurePhase3Collections') {
      const results = await ensurePhase3Collections();
      return NextResponse.json({ ok: true, results });
    }
    if (
      body.action === 'describePhase1Collections' ||
      body.action === 'describePhase2Collections' ||
      body.action === 'describePhase3Collections'
    ) {
      const names = body.action === 'describePhase1Collections'
        ? PHASE_1_COLLECTIONS.map(c => c.name)
        : body.action === 'describePhase2Collections'
        ? PHASE_2_COLLECTIONS.map(c => c.name)
        : [...READ_RECEIPT_COLLECTIONS, ...PHASE_3_OTHER_COLLECTIONS.map(c => c.name)];
      const results: Record<string, any> = {};
      for (const name of names) {
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
