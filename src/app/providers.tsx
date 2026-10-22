'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getSessionEmail } from '@/lib/session';
import { restorePersistedCache, startPersistingCache } from '@/lib/persistedCache';
import { onResumeFromIdle } from '@/lib/idle';

// The queries that poll in the background. They run 3x slower while the person is
// idle, so when they come back they get one immediate refresh instead of waiting
// out a slow tick.
const POLLED_QUERIES = new Set(['hr_notifications', 'hr_tickets', 'hr_messages_all', 'hr_messages', 'hr_tracking_settings', 'hr_announcements', 'hr_maintenance_notices', 'hr_team_documents']);

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000, // 1 minute
          refetchOnWindowFocus: false,
        },
      },
    });
    // Seed the non-sensitive lists (teams, warehouses, announcements,
    // maintenance notices) from the last visit BEFORE anything renders, so they
    // appear instantly; each query's own staleTime decides whether to refetch.
    restorePersistedCache(client, getSessionEmail());
    return client;
  });

  // Keep that snapshot up to date as those lists refresh.
  useEffect(() => startPersistingCache(queryClient, getSessionEmail), [queryClient]);

  useEffect(() => onResumeFromIdle(() => {
    queryClient.refetchQueries({ type: 'active', predicate: q => POLLED_QUERIES.has(String(q.queryKey[0])) });
  }), [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
