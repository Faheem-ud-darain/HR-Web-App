// What the dashboard shell shows while it works out who is signed in.
//
// An employee (or team lead) needs their own profile before the app can open. It comes from two places: /api/me, and the company roster.
// If both have finished and neither produced the person's profile, the saved login was rejected (expired, revoked, the account is gone):
// waiting longer cannot help, so the person must go back to sign-in. Before this, that state showed the grey loading page forever.
export type DashboardGate = 'ready' | 'loading' | 'session_rejected';

export function dashboardGate(a: { role: string | null; dbReady: boolean; hasProfile: boolean; myProfileFetched: boolean; rosterLoading: boolean }): DashboardGate {
  if (!a.role) return 'loading';
  const needsProfile = a.role === 'employee' || a.role === 'team_lead';
  if (!needsProfile) return a.dbReady ? 'ready' : 'loading';
  if (a.hasProfile) return a.dbReady ? 'ready' : 'loading';
  return a.myProfileFetched && !a.rosterLoading ? 'session_rejected' : 'loading';
}
