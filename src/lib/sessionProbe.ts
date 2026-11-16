import { API_BASE } from '@/lib/apiBase';

// When the dashboard cannot get the signed-in person's profile, ask the server once WHY, so the person is told the real reason instead of
// staring at a loading page. 401 means the saved login is no longer valid (sign in again); anything else is not their login's fault.
export interface SessionProbe { status: number | null; html: boolean }

export async function probeSession(token: string | null): Promise<SessionProbe> {
  try {
    const res = await fetch(`${API_BASE}/api/me`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' });
    return { status: res.status, html: (res.headers.get('content-type') || '').includes('text/html') };
  } catch {
    return { status: null, html: false };
  }
}

/** The reason to show, in plain words. A web page where JSON was expected means something in between (a firewall or security check) answered instead of the portal. */
export function describeProbe(p: SessionProbe): string {
  if (p.status === null) return 'The portal could not be reached. Check your internet connection, then try again.';
  if (p.status === 403 && p.html) return 'A firewall or security check between your network and the portal refused the request (403). Try another network, and tell IT this message.';
  if (p.status === 403) return 'Your account is not allowed to open the portal (403). Please contact HR.';
  if (p.status === 401) return 'Your saved sign-in is no longer valid. Please sign in again.';
  if (p.status >= 500) return `The portal had a problem (error ${p.status}). Please try again in a few minutes.`;
  return `The portal could not load your profile (answer ${p.status}). Please try again, or contact HR.`;
}
