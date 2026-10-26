// Pure encode/decode for hr_announcements.target (a plain text column — no
// schema change possible/needed). A warehouse-scoped announcement is stored as
// "wh:<id>,<id>" instead of being collapsed to 'all'. Older rows ('all', 'usa',
// 'pakistan') decode exactly as before.
//
// NOTE: pb_hooks/push_announcements.pb.js (droplet) only understands
// all/usa/pakistan and treats any other value as "everyone" for the PUSH. To
// make the push warehouse-only too, that hook should add a branch for targets
// starting with "wh:" that selects hr_profiles whose assigned_warehouses
// contains one of the listed ids. The in-app feed/popup use this decoding.

export type AnnouncementTarget = 'all' | 'usa' | 'pakistan' | string[];

const WAREHOUSE_PREFIX = 'wh:';

export function encodeAnnouncementTarget(target: AnnouncementTarget): string {
  if (typeof target === 'string') return target;
  const ids = Array.from(new Set(target.map(t => String(t).trim()).filter(Boolean)));
  if (ids.length === 0) throw new Error('Select at least one warehouse for this announcement.');
  return WAREHOUSE_PREFIX + ids.join(',');
}

export function decodeAnnouncementTarget(raw: unknown): AnnouncementTarget {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== 'string' || !raw) return 'all';
  if (raw.startsWith(WAREHOUSE_PREFIX)) {
    const ids = raw.slice(WAREHOUSE_PREFIX.length).split(',').map(s => s.trim()).filter(Boolean);
    return ids.length > 0 ? ids : 'all';
  }
  return raw as AnnouncementTarget;
}
