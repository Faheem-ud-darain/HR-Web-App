'use client';

import { ErrorPanel } from '@/components/ui/ErrorPanel';

// Keeps the sidebar and top bar: only the page content is replaced by the message.
export default function DashboardError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <ErrorPanel error={error} onRetry={unstable_retry} />;
}
