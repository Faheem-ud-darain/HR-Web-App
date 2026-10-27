'use client';

import { useRouter } from 'next/navigation';
import { ChatPanel } from '@/components/assistant/ChatPanel';
import { setAssistantOpen } from '@/components/assistant/assistantStore';

// The assistant as a full page: the same conversation as the small floating window.
export default function AssistantPage() {
  const router = useRouter();
  return (
    <div className="mx-auto h-[calc(100vh-11rem)] min-h-[420px] w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
      <ChatPanel
        variant="page"
        role="hr"
        onMinimise={() => { setAssistantOpen(true); router.push('/hr'); }}
      />
    </div>
  );
}
