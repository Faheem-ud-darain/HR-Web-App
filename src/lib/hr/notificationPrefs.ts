// Pure helpers for notification opt-outs, shared by the browser
// (notifications.ts addNotification) and the server (pbAdmin.ts
// adminAddNotification). No React / PocketBase imports on purpose.
//
// Where preferences live:
//  - NEW (the app reads and writes this): collection `hr_notification_prefs`,
//    one row per email, `prefs` json = { announcement: boolean, ticket: ... }.
//  - LEGACY (what the PocketBase hooks on the droplet still read):
//    hr_delcargo_store row key `hr_notification_prefs_v1`, value =
//    { [emailLowercase]: { announcement: boolean, ... } }.
// The app now honours the new collection for every notification it creates
// itself, and mirrors every preference change to the legacy key (best effort)
// so the existing hooks keep working unchanged.
//
// Ideal follow-up (not done here, hooks are owned elsewhere): update
// pb_hooks/push_notifications.pb.js and pb_hooks/push_announcements.pb.js to
// look up `hr_notification_prefs` by email (field `prefs`) instead of the
// legacy KV map. Once both hooks do that, LEGACY_PREFS_KEY and the mirror
// write in notifications.ts can be removed.

export const LEGACY_PREFS_KEY = 'hr_notification_prefs_v1';

// Categories with no opt-out (see the comments in notifications.ts and the
// hooks): always delivered. Anything else is a category an employee can toggle.
const ALWAYS_ON = new Set(['maintenance', 'hr_admin_line', 'internal']);

/** Categories nobody can opt out of, so there is no reason to look up anyone's preferences for them. */
export const isAlwaysOn = (category: string | undefined): boolean => !category || ALWAYS_ON.has(category);

// Missing prefs, or a missing category, means "on" (opt-out model).
export function isCategoryEnabled(prefs: unknown, category: string | undefined): boolean {
  if (!category || ALWAYS_ON.has(category)) return true;
  if (!prefs || typeof prefs !== 'object') return true;
  return (prefs as Record<string, unknown>)[category] !== false;
}

// Recipients that are a real address (not the 'all' role broadcast).
export function isDirectRecipient(email: string | undefined | null): boolean {
  return !!email && email.toLowerCase() !== 'all';
}

// Merge one person's prefs into the legacy map the hooks read.
export function mergeLegacyPrefs(map: unknown, email: string, prefs: Record<string, boolean>): Record<string, Record<string, boolean>> {
  const base = map && typeof map === 'object' && !Array.isArray(map) ? (map as Record<string, Record<string, boolean>>) : {};
  return { ...base, [email.toLowerCase()]: { ...prefs } };
}
