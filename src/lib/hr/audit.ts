'use client';
import { useQuery } from '@tanstack/react-query';
import { getAuthToken, getOrCreateDeviceId } from '../session';
import { API_BASE } from '../apiBase';
import type { CommunicationKind } from '../core/communicationAudit';

/**
 * Stamps a communication into the permanent trail (the server records the signed-in account, address and device; see
 * core/communicationAudit). Call it right AFTER a message has been saved. It never throws and never waits: a failure here must
 * not stop anyone sending a message.
 */
export function recordCommunication(e: { kind: CommunicationKind; refId: string; messageId?: string; claimedSender?: string }): void {
  void (async () => {
    try {
      const token = getAuthToken();
      if (!token) return;
      await fetch(`${API_BASE}/api/audit/communication`, {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...e, deviceId: await getOrCreateDeviceId() }),
      });
    } catch { /* the message is already saved; the trail is best-effort */ }
  })();
}

export interface AuditRow {
  id: string; kind: CommunicationKind; refId: string; messageId: string; actor: string; actorRole: string; claimedSender: string;
  ip: string; country: string; device: string; occurredAt: string; nameMismatch: boolean;
}
export interface AuditFilters { kind: string; who: string }

// HR and Admin only: the trail from /api/admin/audit, newest first. `configured: false` means the one-time table setup has not been run yet.
export function useCommunicationAudit(filters: AuditFilters) {
  return useQuery({
    queryKey: ['communication_audit', filters],
    queryFn: async (): Promise<{ configured: boolean; items: AuditRow[] }> => {
      const token = getAuthToken();
      if (!token) throw new Error('Not signed in.');
      const qs = new URLSearchParams({ limit: '300', ...(filters.kind ? { kind: filters.kind } : {}), ...(filters.who ? { who: filters.who } : {}) });
      const res = await fetch(`${API_BASE}/api/admin/audit?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(res.status === 403 ? 'Only HR and Admin can open this page.' : 'Could not read the trail. Try again in a moment.');
      return res.json();
    },
  });
}
