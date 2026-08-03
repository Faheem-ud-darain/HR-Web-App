// One-time migration: moves every hr_profiles.profile_picture value (the
// OLD field — an entire photo stored inline as a base64 data URL string,
// e.g. "data:image/webp;base64,...") into the NEW profile_picture_file
// field (a real PocketBase file upload), leaving the old text field alone
// so nothing breaks mid-migration (toProfile in hrData.ts already prefers
// profile_picture_file when present, falling back to the old text field
// otherwise).
//
// Why this had to change: OneSignal's push-notification "large_icon" field
// needs a URL it can actually fetch over HTTP(S) — it can't render an
// inline base64 data URI, so profile pictures could never show up in push
// notifications no matter how correctly the server-side lookup found the
// right employee. On top of that, every profile list load (useProfiles(),
// which basically every dashboard page touches) was downloading every
// employee's full-size encoded photo inline in the JSON response, whether
// or not that page even displays it — this migration fixes both at once.
//
// REQUIRED before running this: add a field named exactly
// `profile_picture_file` to the hr_profiles collection in the PocketBase
// Admin UI (https://pb.delcargo.us/_/) — type File, single file, image
// types only, a few MB max size is plenty. This script does not create
// that field for you; it can only upload into a field that already exists.
//
// Safe to re-run: skips any profile that already has a profile_picture_file
// set, or has no profile_picture to migrate in the first place.
//
// Usage:
//   node migrate_profile_pictures_to_files.mjs
//
// Requires Node 18+ (built-in fetch/FormData/Blob). No dependencies.

const BASE = 'https://pb.delcargo.us';

async function listAll(collection) {
  const res = await fetch(`${BASE}/api/collections/${collection}/records?perPage=200`);
  if (!res.ok) throw new Error(`List ${collection} failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.items || [];
}

// Splits a "data:image/webp;base64,AAAA..." string into its mime type and
// raw bytes. Throws if the string doesn't look like a data URL at all
// (e.g. it's already a plain filename/URL from a previous partial
// migration attempt) so the caller can skip it instead of uploading junk.
function decodeDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('Not a base64 data URL');
  const mimeType = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, 'base64');
  const ext = mimeType.split('/')[1] || 'webp';
  return { buffer, mimeType, ext };
}

async function migrateOne(profile) {
  const raw = profile.profile_picture;
  if (!raw) return 'skip-empty';
  if (profile.profile_picture_file) return 'skip-already-migrated';

  let decoded;
  try {
    decoded = decodeDataUrl(raw);
  } catch {
    return 'skip-not-base64';
  }

  const blob = new Blob([decoded.buffer], { type: decoded.mimeType });
  const formData = new FormData();
  formData.append('profile_picture_file', blob, `profile_${profile.id}.${decoded.ext}`);

  const res = await fetch(`${BASE}/api/collections/hr_profiles/records/${profile.id}`, {
    method: 'PATCH',
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`Upload failed for ${profile.id} (${profile.full_name || profile.email}): ${res.status} ${await res.text()}`);
  }
  return 'migrated';
}

async function main() {
  console.log('--- Migrating hr_profiles.profile_picture -> profile_picture_file ---');
  const profiles = await listAll('hr_profiles');
  console.log(`Found ${profiles.length} profiles.`);

  const counts = { migrated: 0, 'skip-empty': 0, 'skip-already-migrated': 0, 'skip-not-base64': 0, failed: 0 };

  for (const profile of profiles) {
    const label = profile.full_name || profile.email || profile.id;
    try {
      const result = await migrateOne(profile);
      counts[result] += 1;
      if (result === 'migrated') console.log(`  ✓ Migrated: ${label}`);
    } catch (err) {
      counts.failed += 1;
      console.error(`  ✗ Failed: ${label} — ${err.message}`);
    }
  }

  console.log('--- Done ---');
  console.log(counts);
  if (counts.failed > 0) {
    console.log('\nSome profiles failed — safe to just re-run this script, it will only retry the ones that still need it.');
  }
}

main().catch((err) => {
  console.error('Migration script crashed:', err);
  process.exit(1);
});
