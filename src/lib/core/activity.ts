// Navigation "unseen activity" dots — the pure rules (no I/O).
//
// One small row per SCOPE lives in hr_activity: {scope, actor, at}. Each new
// event for a scope OVERWRITES that row (newest wins — dots never pile up), and a
// dot is just "this scope's latest event is newer than the last time I looked,
// and somebody else caused it". What each person last looked at is a small map
// (scope -> ISO time) kept in hr_activity_seen.
//
//   chat:<teamId>          a message in that team channel
//   tickets:staff          any ticket event (HR/Admin watch this)
//   tickets:tech           an event on a Technical Support ticket
//   tickets:user:<email>   an event on that person's own ticket
//
// Plain TypeScript: used by the browser and unit-tested.

export interface ActivityRow {
  scope: string;
  /** Lower-cased email of whoever caused the event. */
  actor: string;
  /** ISO time of the latest event. */
  at: string;
}

/** scope -> ISO time the person last viewed it. `__baseline` is when they started being tracked. */
export type SeenMap = Record<string, string>;

export const BASELINE_KEY = '__baseline';

export const chatScope = (teamId: string): string => `chat:${teamId}`;
export const TICKETS_STAFF_SCOPE = 'tickets:staff';
export const TICKETS_TECH_SCOPE = 'tickets:tech';
export const ticketsUserScope = (email: string): string => `tickets:user:${email.trim().toLowerCase()}`;

export type DotPage = 'tickets' | 'chat' | 'hr-admin';

export interface DotViewer {
  role: string;
  email: string;
  /** Member of the Technical Support team (sees technical tickets). */
  technical: boolean;
  /** Team ids this person's chat page covers (HR/Admin: every channel except the HR-Admin line). */
  chatTeamIds: string[];
  /** The id of the private HR <-> Admin channel. */
  hrAdminTeamId: string;
}

/** Scopes whose activity should light the nav dot for `page` for this viewer. */
export function scopesForPage(page: DotPage, viewer: DotViewer): string[] {
  const staff = viewer.role === 'hr' || viewer.role === 'admin';
  if (page === 'tickets') {
    if (staff) return [TICKETS_STAFF_SCOPE];
    return [ticketsUserScope(viewer.email), ...(viewer.technical ? [TICKETS_TECH_SCOPE] : [])];
  }
  if (page === 'hr-admin') return staff ? [chatScope(viewer.hrAdminTeamId)] : [];
  return viewer.chatTeamIds.filter(id => id !== viewer.hrAdminTeamId).map(chatScope);
}

/** Is there a scope with an event from SOMEONE ELSE newer than what this person last saw? */
export function hasUnseen(scopes: string[], rows: ReadonlyMap<string, ActivityRow>, seen: SeenMap, me: string): boolean {
  const mine = me.trim().toLowerCase();
  const baseline = seen[BASELINE_KEY] || '';
  return scopes.some(scope => {
    const row = rows.get(scope);
    if (!row || !row.at || row.actor.toLowerCase() === mine) return false;
    return row.at > (seen[scope] || baseline);
  });
}

/**
 * The seen-map after this person looks at `scopes`: every scope whose latest
 * event is newer than what they'd seen is brought up to date. Returns the SAME
 * object when nothing changed, so callers can skip a save.
 */
export function markScopesSeen(scopes: string[], rows: ReadonlyMap<string, ActivityRow>, seen: SeenMap): SeenMap {
  let next: SeenMap | null = null;
  for (const scope of scopes) {
    const at = rows.get(scope)?.at;
    if (at && at > (seen[scope] || seen[BASELINE_KEY] || '')) {
      next = next || { ...seen };
      next[scope] = at;
    }
  }
  return next || seen;
}

/** Which scopes a ticket event touches, and for whom (the actor never gets a dot from their own event). */
export function ticketEventScopes(ticket: { employeeEmail: string; department: string }): string[] {
  return [
    TICKETS_STAFF_SCOPE,
    ticketsUserScope(ticket.employeeEmail),
    ...(ticket.department === 'technical' ? [TICKETS_TECH_SCOPE] : []),
  ];
}

/** Keeps the newest row per scope (a realtime event or a refetch may arrive out of order). */
export function mergeActivityRows(current: ActivityRow[], incoming: ActivityRow[]): ActivityRow[] {
  const byScope = new Map(current.map(r => [r.scope, r]));
  for (const row of incoming) {
    const existing = byScope.get(row.scope);
    if (!existing || row.at >= existing.at) byScope.set(row.scope, row);
  }
  return [...byScope.values()];
}
