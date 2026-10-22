import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { pbAdminFetch } from '@/lib/pbAdmin';
import { parseLeaveDateStrings } from '@/lib/core/leaves';
import { errMsg } from '@/lib/errors';
import type { PbRow } from '@/lib/pbTypes';

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
// IMPORTANT (discovered live, 2026-09-11): hr_notification_reads,
// hr_notification_cleared, hr_announcement_reads, hr_message_reads, and
// hr_notification_prefs all pre-existed from earlier, unrecorded prep work
// with a DIFFERENT shape than the read-receipt one below — one row PER
// EMAIL holding an array of ids (e.g. { email, read_ids: [...] }), not one
// row per (entity, email) pair. That shape is already race-safe across
// users (each person only ever writes their own row), so those 5
// collections were deliberately left as-is rather than migrated — the
// app code (notifications.ts/teams.ts) was adapted to match their real
// schema instead (see shared.ts's pbGetIdSetMap/pbMarkIdsInField). Only
// hr_maintenance_notice_reads is a genuine new read-receipt collection
// (created fresh by this plan, no pre-existing collision).
const READ_RECEIPT_COLLECTIONS = [
  'hr_maintenance_notice_reads',
];

function readReceiptSchema() {
  return [
    { name: 'read_key', type: 'text', required: true, unique: true, options: { min: null, max: null, pattern: '' } },
    { name: 'entity_id', type: 'text', required: true, unique: false, options: { min: null, max: null, pattern: '' } },
    { name: 'email', type: 'text', required: true, unique: false, options: { min: null, max: null, pattern: '' } },
  ];
}

// Collections that pre-existed (see the comment above READ_RECEIPT_COLLECTIONS)
// with their own real shape — listed here ONLY so describePhase3Collections
// can report their actual state; ensurePhase3Collections never tries to
// create/touch these, since app code already targets their real schema.
const PHASE_3_PREEXISTING_COLLECTIONS = [
  'hr_notification_reads',
  'hr_notification_cleared',
  'hr_announcement_reads',
  'hr_message_reads',
  'hr_notification_prefs',
];

const PHASE_3_OTHER_COLLECTIONS: Array<{ name: string; schema: PbRow[]; indexes: string[] }> = [
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


// Phase 4 collections — ephemeral, high-write-frequency signals (see plan
// 027). ONLY the two items with no external-system dependency are done
// here: hr_typing_indicators (chat/ticket "X is typing" heartbeat, one row
// per scope+scopeId+email) and hr_ticket_seen (one row per ticketId, "seen
// by employee" marker). The other Phase 4 item in the plan —
// hr_tracker_signals, consolidating the 8 tracker-agent ping/pong/
// heartbeat/quit-intent/command/diagnostics keys — is deliberately NOT
// included: tracker-agent/agent_gui.py (a separate Python program already
// installed and running on every employee's desktop) hardcodes
// PB_COLLECTION = "hr_delcargo_store" and subscribes to realtime SSE on
// that exact collection name. Moving those keys requires a coordinated
// agent-side code change AND a rollout to every already-running desktop
// agent — done in its own dedicated pass, not bundled in here.
const PHASE_4_COLLECTIONS: Array<{ name: string; schema: PbRow[]; indexes: string[] }> = [
  {
    name: 'hr_typing_indicators',
    schema: [
      { name: 'typing_key', type: 'text', required: true, unique: true, options: { min: null, max: null, pattern: '' } },
      { name: 'scope', type: 'text', required: true, unique: false, options: { min: null, max: null, pattern: '' } },
      { name: 'scope_id', type: 'text', required: true, unique: false, options: { min: null, max: null, pattern: '' } },
      { name: 'email', type: 'text', required: true, unique: false, options: { min: null, max: null, pattern: '' } },
      { name: 'display_name', type: 'text', required: false, unique: false, options: { min: null, max: null, pattern: '' } },
      { name: 'last_typed_at', type: 'text', required: false, unique: false, options: { min: null, max: null, pattern: '' } },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_hr_typing_indicators_typing_key ON hr_typing_indicators (typing_key)'],
  },
  {
    name: 'hr_ticket_seen',
    schema: [
      { name: 'ticket_id', type: 'text', required: true, unique: true, options: { min: null, max: null, pattern: '' } },
      { name: 'employee_seen_at', type: 'text', required: false, unique: false, options: { min: null, max: null, pattern: '' } },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_hr_ticket_seen_ticket_id ON hr_ticket_seen (ticket_id)'],
  },
];

async function ensurePhase4Collections(): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  for (const { name, schema, indexes } of PHASE_4_COLLECTIONS) {
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


// Phase 4b — the 8-signal tracker-agent migration (plan 027 "migrate and
// retire"). Consolidates 8 previously-separate hr_delcargo_store KV keys
// per employee (tracker_heartbeat_<email>, shift_stop_signal_<email>,
// tracker_quit_intent_<email>, tracker_ping_<email>, tracker_pong_<email>,
// tracker_stop_cmd_<email>, tracker_command_<email>,
// tracker_diagnostics_<email>) into ONE row per employee with 8 named json
// sub-fields. Requires the tracker-agent (agent_gui.py) to be updated in
// lockstep — see its _get_tracker_signal_field/_set_tracker_signal_field
// helpers and the version-floor bump that forces every already-installed
// agent onto the new build before this collection matters to it.
//
// hr_tracker_signals turned out to ALREADY EXIST from earlier, unrecorded
// prep work (discovered 2026-09-13 via describePhase4bCollections) — same
// recurring pattern as hr_notification_reads/hr_typing_indicators etc.
// earlier in this plan. Its real shape: keyed on `email` (not
// `employee_email`), most signal fields already present as json
// (heartbeat, quit_intent, stop_cmd, command, diagnostics,
// shift_stop_signal), but `ping`/`pong` existed as `date` fields
// (ping_at/pong_at) which can't hold the {employeeEmail, requestId,
// requestedAt} payload the Start Shift handshake needs — added as new
// `ping`/`pong` json fields via addFieldIfMissing instead (the old
// ping_at/pong_at/shift_tab_heartbeat fields are left alone, unused). Also
// had admin-only rules (listRule: null) — fixed via makeCollectionPublic.
// All code below (shared.ts/timesheets.ts/profiles.ts/agent_gui.py) reads
// this real shape (the `email` field), not the originally-assumed one.
const TRACKER_SIGNAL_FIELDS = [
  'heartbeat', 'shift_stop_signal', 'quit_intent', 'ping', 'pong', 'stop_cmd', 'command', 'diagnostics',
];

async function ensurePhase4bCollections(): Promise<Record<string, string>> {
  const name = 'hr_tracker_signals';
  if (await collectionExists(name)) {
    return { [name]: 'already exists' };
  }
  // Only reached if this collection doesn't exist yet somewhere else this
  // app gets deployed against (it already existed in production — see the
  // comment above). Uses `email` as the key field to match that real shape.
  const schema = [
    { name: 'email', type: 'text', required: true, unique: true, options: { min: null, max: null, pattern: '' } },
    ...TRACKER_SIGNAL_FIELDS.map(f => ({ name: f, type: 'json', required: false, unique: false, options: { maxSize: 2000000 } })),
  ];
  await pbAdminFetch('/api/collections', {
    method: 'POST',
    body: JSON.stringify({
      name,
      type: 'base',
      schema,
      indexes: [`CREATE UNIQUE INDEX idx_${name}_email ON ${name} (email)`],
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
    }),
  });
  return { [name]: 'created' };
}


// Phase 5 collections — safe cleanup subset only (see plan 027). Two items
// with no tracker-agent dependency: hr_system_state (a general-purpose
// singleton-state collection — one row per `key`, arbitrary `data` json —
// replacing the single hr_screenshot_retention_state_v1 KV row, using the
// same shape as Phase 1's baseSchemaFor) and hr_shift_tab_heartbeats (one
// row per email, replacing the old shift_tab_heartbeat_<email> KV key —
// confirmed via tracker-agent/agent_gui.py that this key is never touched
// by the desktop tracker agent, unlike the 5-Signal system). The rest of
// Phase 5 (retiring the KV helpers entirely, locking/retiring
// hr_delcargo_store itself) stays blocked on the still-deferred
// tracker-agent migration and on the legacy screenshot_<id> rows aging
// out via the existing retention sweep.
const PHASE_5_COLLECTIONS: Array<{ name: string; keyField: string; extraField: string }> = [
  { name: 'hr_system_state', keyField: 'key', extraField: 'data' },
  { name: 'hr_shift_tab_heartbeats', keyField: 'email', extraField: 'last_seen_at' },
];

async function ensurePhase5Collections(): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  for (const { name, keyField, extraField } of PHASE_5_COLLECTIONS) {
    if (await collectionExists(name)) {
      results[name] = 'already exists';
      continue;
    }
    // hr_shift_tab_heartbeats' extraField (last_seen_at) is a plain text
    // timestamp, not a json blob like every other baseSchemaFor user —
    // build its schema directly rather than stretching baseSchemaFor to
    // cover both shapes.
    const schema = name === 'hr_shift_tab_heartbeats'
      ? [
          { name: keyField, type: 'text', required: true, unique: true, options: { min: null, max: null, pattern: '' } },
          { name: extraField, type: 'text', required: false, unique: false, options: { min: null, max: null, pattern: '' } },
        ]
      : baseSchemaFor(keyField, extraField);
    await pbAdminFetch('/api/collections', {
      method: 'POST',
      body: JSON.stringify({
        name,
        type: 'base',
        schema,
        indexes: [`CREATE UNIQUE INDEX idx_${name}_${keyField} ON ${name} (${keyField})`],
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

  let body: PbRow = {};
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
    if (body.action === 'ensurePhase4Collections') {
      const results = await ensurePhase4Collections();
      return NextResponse.json({ ok: true, results });
    }
    if (body.action === 'ensurePhase5Collections') {
      const results = await ensurePhase5Collections();
      return NextResponse.json({ ok: true, results });
    }
    if (body.action === 'ensurePhase4bCollections') {
      const results = await ensurePhase4bCollections();
      return NextResponse.json({ ok: true, results });
    }
    if (
      body.action === 'describePhase1Collections' ||
      body.action === 'describePhase2Collections' ||
      body.action === 'describePhase3Collections' ||
      body.action === 'describePhase4Collections' ||
      body.action === 'describePhase5Collections' ||
      body.action === 'describePhase4bCollections'
    ) {
      const names = body.action === 'describePhase1Collections'
        ? PHASE_1_COLLECTIONS.map(c => c.name)
        : body.action === 'describePhase2Collections'
        ? PHASE_2_COLLECTIONS.map(c => c.name)
        : body.action === 'describePhase3Collections'
        ? [...READ_RECEIPT_COLLECTIONS, ...PHASE_3_OTHER_COLLECTIONS.map(c => c.name), ...PHASE_3_PREEXISTING_COLLECTIONS]
        : body.action === 'describePhase4Collections'
        ? PHASE_4_COLLECTIONS.map(c => c.name)
        : body.action === 'describePhase5Collections'
        ? PHASE_5_COLLECTIONS.map(c => c.name)
        : ['hr_tracker_signals'];
      const results: PbRow = {};
      for (const name of names) {
        try {
          const schema = await pbAdminFetch(`/api/collections/${name}`);
          results[name] = {
            fields: (schema?.schema || []).map((f: PbRow) => ({ name: f.name, type: f.type, unique: f.unique, required: f.required })),
            indexes: schema?.indexes || [],
            listRule: schema?.listRule,
          };
        } catch (err) {
          results[name] = { error: errMsg(err, String(err)) };
        }
      }
      return NextResponse.json({ ok: true, results });
    }
    if (body.action === 'describeCollection') {
      // Ad-hoc, one-off diagnostic — describe any collection by name (not
      // just the ones this migration plan knows about), for live-debugging
      // an unexpected write failure against its real schema.
      const name = body.collection;
      if (typeof name !== 'string' || !name) {
        return NextResponse.json({ error: 'body.collection is required.' }, { status: 400 });
      }
      const schema = await pbAdminFetch(`/api/collections/${name}`);
      return NextResponse.json({
        ok: true,
        collection: name,
        fields: (schema?.schema || []).map((f: PbRow) => ({ name: f.name, type: f.type, unique: f.unique, required: f.required, options: f.options })),
        indexes: schema?.indexes || [],
        listRule: schema?.listRule,
        updateRule: schema?.updateRule,
      });
    }
    if (body.action === 'getRecord') {
      // Ad-hoc — fetch one record's full raw fields by collection+id, for
      // live-debugging a specific write failure (e.g. a 400 PATCH).
      const name = body.collection;
      const id = body.id;
      if (typeof name !== 'string' || !name || typeof id !== 'string' || !id) {
        return NextResponse.json({ error: 'body.collection and body.id are required.' }, { status: 400 });
      }
      const record = await pbAdminFetch(`/api/collections/${name}/records/${id}`);
      return NextResponse.json({ ok: true, record });
    }
    if (body.action === 'listRecords') {
      // Ad-hoc — dump up to `perPage` raw records from any collection
      // (optionally filtered), for live-debugging whether rows actually
      // exist / are shaped as expected. Same spirit as getRecord/
      // describeCollection above, just for a batch of rows instead of a
      // known single id or the schema alone.
      const name = body.collection;
      if (typeof name !== 'string' || !name) {
        return NextResponse.json({ error: 'body.collection is required.' }, { status: 400 });
      }
      const perPage = typeof body.perPage === 'number' ? body.perPage : 20;
      const params = new URLSearchParams({ perPage: String(perPage) });
      if (typeof body.filter === 'string' && body.filter) params.set('filter', body.filter);
      const result = await pbAdminFetch(`/api/collections/${name}/records?${params.toString()}`);
      return NextResponse.json({ ok: true, collection: name, totalItems: result?.totalItems, items: result?.items || [] });
    }
    if (body.action === 'backfillProfileExtrasFromKV') {
      // One-off remediation for the Sep 2026 "employees see real names
      // instead of aliases" regression: ensurePhase2Collections created
      // hr_profile_extras but never copied forward the real HR-entered
      // overlay data (alias, approval history, phone numbers, etc.) that
      // was still sitting in the old hr_delcargo_store KV rows
      // (hr_profile_extra_<profileId>). This copies those rows over, one
      // time, without touching hr_delcargo_store itself.
      //
      // Idempotent — safe to re-run: existing hr_profile_extras data
      // always wins over the old KV value on any field conflict, so a
      // newer HR edit is never clobbered by stale pre-migration data.
      // Pass { dryRun: true } to preview the merge without writing.
      //
      // Batches the existence/lookup checks into two list calls up front
      // (instead of one request per profile) to stay well under
      // Cloudflare Workers' per-invocation subrequest limit — the first
      // version of this action did a profile-exists check + an extras
      // lookup per row and blew past that limit with ~20 profiles.
      const dryRun = body.dryRun === true;
      const kvRows = await pbAdminFetch(
        `/api/collections/hr_delcargo_store/records?perPage=200&filter=${encodeURIComponent('key ~ "hr_profile_extra_"')}`
      );
      const allProfiles = await pbAdminFetch('/api/collections/hr_profiles/records?perPage=200&fields=id');
      const profileIds = new Set<string>((allProfiles?.items || []).map((p: PbRow) => p.id));
      const allExtras = await pbAdminFetch('/api/collections/hr_profile_extras/records?perPage=200');
      const extrasByProfileId = new Map<string, PbRow>();
      for (const rec of allExtras?.items || []) {
        if (rec.profile_id) extrasByProfileId.set(rec.profile_id, rec);
      }

      const results: Array<PbRow> = [];
      for (const row of kvRows?.items || []) {
        const profileId = String(row.key || '').replace(/^hr_profile_extra_/, '');
        if (!profileId) continue;

        // Skip rows for profiles that no longer exist (e.g. an offboarded/
        // deleted employee) — nothing in hr_profile_extras to attach this to.
        if (!profileIds.has(profileId)) {
          results.push({ profileId, action: 'skipped', reason: 'profile no longer exists' });
          continue;
        }

        let kvData: PbRow = {};
        try {
          kvData = typeof row.value === 'string' ? JSON.parse(row.value) : (row.value || {});
        } catch {
          results.push({ profileId, action: 'skipped', reason: 'unparseable KV value' });
          continue;
        }

        const existing = extrasByProfileId.get(profileId);
        const merged = { ...kvData, ...(existing?.data || {}) };

        if (dryRun) {
          results.push({ profileId, action: existing ? 'would_patch' : 'would_create', merged });
          continue;
        }

        if (existing) {
          await pbAdminFetch(`/api/collections/hr_profile_extras/records/${existing.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ data: merged }),
          });
          results.push({ profileId, action: 'patched' });
        } else {
          await pbAdminFetch(`/api/collections/hr_profile_extras/records`, {
            method: 'POST',
            body: JSON.stringify({ profile_id: profileId, data: merged }),
          });
          results.push({ profileId, action: 'created' });
        }
      }
      return NextResponse.json({ ok: true, dryRun, count: results.length, results });
    }
    if (body.action === 'addFieldIfMissing') {
      // Ad-hoc — add one field to an existing collection's schema if it
      // isn't already there (purely additive; never touches existing
      // fields/data). Used to reconcile a pre-existing collection
      // discovered mid-phase that's missing a column this app's code
      // needs (same root cause/pattern as the rule mismatches elsewhere
      // in this route — earlier, unrecorded prep work set the collection
      // up slightly differently than this plan's code expects).
      const name = body.collection;
      const field = body.field;
      if (typeof name !== 'string' || !name || !field || typeof field.name !== 'string') {
        return NextResponse.json({ error: 'body.collection and body.field ({ name, type, ... }) are required.' }, { status: 400 });
      }
      const existing = await pbAdminFetch(`/api/collections/${name}`);
      const already = (existing.schema || []).some((f: PbRow) => f.name === field.name);
      if (already) {
        return NextResponse.json({ ok: true, collection: name, field: field.name, result: 'already exists' });
      }
      const newSchema = [...(existing.schema || []), field];
      await pbAdminFetch(`/api/collections/${existing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ schema: newSchema }),
      });
      return NextResponse.json({ ok: true, collection: name, field: field.name, result: 'added' });
    }
    if (body.action === 'ensureScreenshotThumbs') {
      // Lets PocketBase serve ?thumb=300x180 for hr_screenshots.image so the
      // screenshot grid downloads small previews instead of full-size WebPs.
      // Only edits the file field's `thumbs` option; existing files get their
      // thumbnail generated lazily on first request.
      const size = '300x180';
      const existing = await pbAdminFetch('/api/collections/hr_screenshots');
      const schema: any[] = existing.schema || [];
      const field = schema.find((f: any) => f.name === 'image');
      if (!field) return NextResponse.json({ error: 'hr_screenshots.image not found' }, { status: 404 });
      const thumbs: string[] = field.options?.thumbs || [];
      if (thumbs.includes(size)) return NextResponse.json({ ok: true, result: 'already configured', thumbs });
      field.options = { ...(field.options || {}), thumbs: [...thumbs, size] };
      await pbAdminFetch(`/api/collections/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ schema }) });
      return NextResponse.json({ ok: true, result: 'added', thumbs: field.options.thumbs });
    }
    if (body.action === 'ensureLeaveDateFields') {
      // Adds hr_leaves.start_date / end_date ("YYYY-MM-DD" text) so leaves can be
      // filtered by date server-side. Purely additive — never touches existing
      // fields or rows. Run backfillLeaveDates afterwards to fill old rows.
      const results: Record<string, string> = {};
      const existing = await pbAdminFetch('/api/collections/hr_leaves');
      let schema: PbRow[] = existing.schema || [];
      let changed = false;
      for (const name of ['start_date', 'end_date']) {
        if (schema.some((f: PbRow) => f.name === name)) { results[name] = 'already exists'; continue; }
        schema = [...schema, { name, type: 'text', required: false, unique: false, options: { min: null, max: 10, pattern: '' } }];
        results[name] = 'added';
        changed = true;
      }
      if (changed) {
        await pbAdminFetch(`/api/collections/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ schema }) });
      }
      return NextResponse.json({ ok: true, results });
    }
    if (body.action === 'ensureActivityCollections') {
      // Creates the two tiny tables behind the navigation "unseen activity" dots
      // (see src/lib/core/activity.ts):
      //   hr_activity       one row per scope; each new event OVERWRITES it
      //   hr_activity_seen  one row per person: what they last looked at
      // Additive only. Defaults to a dry run — pass { dryRun: false } to create.
      const dryRun = body.dryRun !== false;
      const text = (name: string, required = false) => ({ name, type: 'text', required, unique: false, options: { min: null, max: null, pattern: '' } });
      const wanted = [
        {
          name: 'hr_activity',
          schema: [{ ...text('scope', true), unique: true }, text('actor'), text('at')],
          indexes: ['CREATE UNIQUE INDEX idx_hr_activity_scope ON hr_activity (scope)'],
        },
        {
          name: 'hr_activity_seen',
          schema: [{ ...text('email', true), unique: true }, { name: 'seen', type: 'json', required: false, unique: false, options: { maxSize: 20000 } }],
          indexes: ['CREATE UNIQUE INDEX idx_hr_activity_seen_email ON hr_activity_seen (email)'],
        },
      ];
      const results: Record<string, string> = {};
      for (const { name, schema, indexes } of wanted) {
        if (await collectionExists(name)) { results[name] = 'already exists'; continue; }
        if (!dryRun) {
          await pbAdminFetch('/api/collections', {
            method: 'POST',
            // Same open read/write rules as the app's other state tables (the browser talks to
            // PocketBase directly); deleting stays admin-only.
            body: JSON.stringify({ name, type: 'base', schema, indexes, listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: null }),
          });
        }
        results[name] = dryRun ? 'would create' : 'created';
      }
      return NextResponse.json({ ok: true, dryRun, results });
    }
    if (body.action === 'deleteActivityRows') {
      // Maintenance helper for the two dot tables ONLY (their delete rule is admin-only on
      // purpose, so the browser can't wipe them): removes the rows matching `filter`.
      // Refuses any other collection and refuses an empty filter.
      const name = body.collection;
      if (name !== 'hr_activity' && name !== 'hr_activity_seen') {
        return NextResponse.json({ error: 'Only hr_activity and hr_activity_seen are allowed.' }, { status: 400 });
      }
      if (typeof body.filter !== 'string' || !body.filter.trim()) {
        return NextResponse.json({ error: 'A non-empty filter is required.' }, { status: 400 });
      }
      const found = await pbAdminFetch(`/api/collections/${name}/records?perPage=100&fields=id&filter=${encodeURIComponent(body.filter)}`);
      const ids: string[] = (found?.items || []).map((r: PbRow) => r.id);
      for (const id of ids) await pbAdminFetch(`/api/collections/${name}/records/${id}`, { method: 'DELETE' });
      return NextResponse.json({ ok: true, deleted: ids.length });
    }
    if (body.action === 'previewRetention') {
      // READ-ONLY. Reports how many rows each rule in pb_hooks/retention_cleanup.pb.js
      // would delete right now (the hook itself caps each table per night). Keep the
      // collections/filters here in sync with that file.
      const DAY_MS = 24 * 60 * 60 * 1000;
      const cutoff = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString().replace('T', ' ');
      const rules = [
        { collection: 'hr_notifications', field: 'created', days: 60 },
        { collection: 'hr_typing_indicators', field: 'updated', days: 1 },
        { collection: 'hr_rate_limits', field: 'updated', days: 2 },
      ];
      const results: Array<{ collection: string; rule: string; wouldDelete: number | string; total: number | string }> = [];
      for (const r of rules) {
        try {
          const old = await pbAdminFetch(`/api/collections/${r.collection}/records?perPage=1&fields=id&filter=${encodeURIComponent(`${r.field} < "${cutoff(r.days)}"`)}`);
          const all = await pbAdminFetch(`/api/collections/${r.collection}/records?perPage=1&fields=id`);
          results.push({ collection: r.collection, rule: `${r.field} older than ${r.days} day(s)`, wouldDelete: old?.totalItems ?? 0, total: all?.totalItems ?? 0 });
        } catch (err) {
          results.push({ collection: r.collection, rule: `${r.field} older than ${r.days} day(s)`, wouldDelete: `error: ${errMsg(err, String(err)).slice(0, 80)}`, total: '?' });
        }
      }
      return NextResponse.json({ ok: true, results });
    }
    if (body.action === 'ensurePerformanceIndexes') {
      // Adds plain (non-unique) indexes for the filters/sorts the app actually
      // runs against its biggest, most-polled tables. Purely additive and
      // idempotent: an index that already exists (by name) is left alone, a
      // column that doesn't exist is skipped and reported, nothing is ever
      // dropped, and no row data is touched. Defaults to a dry run — pass
      // { dryRun: false } to apply.
      const dryRun = body.dryRun !== false;
      const wanted: Array<{ collection: string; columns: string[] }> = [
        // Notifications are polled every 30s per open tab:
        //   recipient_email = X || (recipient_role = R && recipient_email = "all") ORDER BY created DESC
        { collection: 'hr_notifications', columns: ['recipient_email', 'created'] },
        { collection: 'hr_notifications', columns: ['recipient_role', 'recipient_email'] },
        // clock_out = "" || date >= {cutoff} ORDER BY created DESC
        { collection: 'hr_timesheets', columns: ['clock_out'] },
        { collection: 'hr_timesheets', columns: ['date'] },
        { collection: 'hr_timesheets', columns: ['employee_id', 'date'] },
        // status = "pending" || ... || end_date >= {cutoff}; employee_name = {name}
        { collection: 'hr_leaves', columns: ['status'] },
        { collection: 'hr_leaves', columns: ['end_date'] },
        { collection: 'hr_leaves', columns: ['employee_name'] },
        // status != "done" || created >= {cutoff}; assigned_email filters
        { collection: 'hr_tasks', columns: ['assigned_email', 'status'] },
        { collection: 'hr_tasks', columns: ['status', 'created'] },
        { collection: 'hr_tickets', columns: ['status', 'created'] },
        { collection: 'hr_tickets', columns: ['employee_email'] },
        // deleted = false && date >= {since}
        { collection: 'hr_absence_records', columns: ['date'] },
        { collection: 'hr_profiles', columns: ['email'] },
        // Legacy KV lookups by key (still used for a few settings)
        { collection: 'hr_delcargo_store', columns: ['key'] },
        // Read-state lookups are now scoped to one person (email = X) on every screen.
        { collection: 'hr_notification_reads', columns: ['email'] },
        { collection: 'hr_notification_cleared', columns: ['email'] },
        { collection: 'hr_announcement_reads', columns: ['email'] },
        { collection: 'hr_message_reads', columns: ['email'] },
        { collection: 'hr_maintenance_notice_reads', columns: ['email'] },
        // Chat receipts / maintenance reads are looked up by message/notice id.
        { collection: 'hr_maintenance_notice_reads', columns: ['entity_id'] },
      ];
      const systemColumns = new Set(['id', 'created', 'updated']);
      const byCollection = new Map<string, typeof wanted>();
      for (const w of wanted) byCollection.set(w.collection, [...(byCollection.get(w.collection) || []), w]);
      const results: Array<{ collection: string; index: string; result: string }> = [];
      for (const [collection, items] of byCollection) {
        let existing: PbRow;
        try { existing = await pbAdminFetch(`/api/collections/${collection}`); }
        catch { items.forEach(i => results.push({ collection, index: i.columns.join('+'), result: 'skipped: collection not found' })); continue; }
        const fieldNames = new Set<string>((existing.schema || []).map((f: PbRow) => f.name));
        const indexes: string[] = [...(existing.indexes || [])];
        let changed = false;
        for (const { columns } of items) {
          const name = `idx_${collection}_${columns.join('_')}`;
          const label = columns.join('+');
          const missing = columns.filter(c => !fieldNames.has(c) && !systemColumns.has(c));
          if (missing.length) { results.push({ collection, index: label, result: `skipped: no such column ${missing.join(',')}` }); continue; }
          // Already covered by ANY existing index on exactly these columns (unique
          // ones included, whatever they're named) — don't add a redundant twin.
          const coveredBy = indexes.find(sql => {
            if (sql.includes('`' + name + '`') || sql.includes(` ${name} `)) return true;
            const cols = /ON\s+`?[\w]+`?\s*\(([^)]*(?:\([^)]*\))?[^)]*)\)/i.exec(sql)?.[1];
            if (!cols) return false;
            const normalized = cols.split(',').map(c => c.replace(/LOWER\(|\)|`|"/gi, '').trim().toLowerCase());
            return normalized.length === columns.length && normalized.every((c, i) => c === columns[i].toLowerCase());
          });
          if (coveredBy) { results.push({ collection, index: label, result: 'already exists' }); continue; }
          indexes.push(`CREATE INDEX \`${name}\` ON \`${collection}\` (${columns.map(c => '`' + c + '`').join(', ')})`);
          results.push({ collection, index: label, result: dryRun ? 'would add' : 'added' });
          changed = true;
        }
        if (changed && !dryRun) {
          await pbAdminFetch(`/api/collections/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ indexes }) });
        }
      }
      return NextResponse.json({ ok: true, dryRun, results });
    }
    if (body.action === 'backfillLeaveDates') {
      // Fills start_date / end_date on hr_leaves rows that don't have them yet by
      // parsing the free-text `duration` ("Sep 03, 2026 - Sep 04, 2026"). Rows
      // whose duration can't be parsed are reported and left untouched. Defaults
      // to a dry run — pass { dryRun: false } to write.
      const dryRun = body.dryRun !== false;
      const filter = encodeURIComponent('start_date = "" || end_date = ""');
      const updates: Array<{ id: string; duration: string; start: string; end: string }> = [];
      const unparseable: Array<{ id: string; duration: string }> = [];
      for (let page = 1; page < 50; page++) {
        const res = await pbAdminFetch(`/api/collections/hr_leaves/records?perPage=200&page=${page}&filter=${filter}&fields=id,duration,start_date,end_date`);
        const items: PbRow[] = res?.items || [];
        for (const r of items) {
          const range = parseLeaveDateStrings(r.duration || '');
          if (range) updates.push({ id: r.id, duration: r.duration, start: range.start, end: range.end });
          else unparseable.push({ id: r.id, duration: r.duration });
        }
        if (items.length < 200) break;
      }
      if (!dryRun) {
        for (const u of updates) {
          await pbAdminFetch(`/api/collections/hr_leaves/records/${u.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ start_date: u.start, end_date: u.end }),
          });
        }
      }
      return NextResponse.json({ ok: true, dryRun, toUpdate: updates.length, unparseable, sample: updates.slice(0, 8) });
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    console.error('[admin/schema-migration] error:', err);
    return NextResponse.json({ error: errMsg(err, String(err)) }, { status: 500 });
  }
}
