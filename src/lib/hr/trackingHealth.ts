'use client';
import { useQuery } from '@tanstack/react-query';
import { getAuthToken } from '../session';
import { API_BASE } from '../apiBase';
import type { TrackerDiagnosis } from '../core/trackerDiagnosis';

export interface TrackingHealth { checkedAt: string; trackers: TrackerDiagnosis[] }

// HR and Admin only: every tracker's state with its cause and next step, from /api/admin/tracking-integrity (the same check the scheduled alert
// runs). It refreshes itself every minute while the Tracker Health page is open.
export function useTrackingHealth() {
  return useQuery({
    queryKey: ['tracking_health'],
    refetchInterval: 60_000,
    queryFn: async (): Promise<TrackingHealth> => {
      const token = getAuthToken();
      if (!token) throw new Error('Not signed in.');
      const res = await fetch(`${API_BASE}/api/admin/tracking-integrity`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(res.status === 403 ? 'Only HR and Admin can open the Tracker Health page.' : 'Could not read tracker health. Try again in a moment.');
      return res.json();
    },
  });
}
