// The browser side of leave date-change requests (rules and storage are on the server: /api/leaves/date-change).
import { useQuery } from '@tanstack/react-query';
import { getAuthToken } from '../session';
import { API_BASE } from '../apiBase';
import type { LeaveDateChange } from '../core/leaveDateChange';

/** The employee's own requests, or every request still waiting for HR and Admin. `configured` is false until Admin has run the set-up. */
export function useLeaveDateChanges() {
  return useQuery({
    queryKey: ['leave_date_changes'],
    staleTime: 15_000,
    queryFn: async (): Promise<{ configured: boolean; requests: LeaveDateChange[] }> => {
      const token = getAuthToken();
      if (!token) return { configured: false, requests: [] };
      const res = await fetch(`${API_BASE}/api/leaves/date-change`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return { configured: false, requests: [] };
      return res.json();
    },
  });
}

export type LeaveDateChangeAction =
  | { action: 'request'; leaveId: string; newStart: string; newEnd: string; reason: string }
  | { action: 'cancel' | 'approve' | 'reject'; changeId: string };

/** Throws with the server's plain-language message when the change is not allowed. */
export async function leaveDateChangeAction(body: LeaveDateChangeAction): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error('Not signed in.');
  const res = await fetch(`${API_BASE}/api/leaves/date-change`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
}
