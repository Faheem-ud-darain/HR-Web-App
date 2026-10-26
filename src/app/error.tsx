'use client';

import { ErrorPanel } from '@/components/ui/ErrorPanel';

export default function Error({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <ErrorPanel error={error} onRetry={unstable_retry} fullScreen />;
}
