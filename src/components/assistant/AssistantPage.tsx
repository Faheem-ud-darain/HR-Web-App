'use client';

import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import { ChatHistoryList } from './ChatHistoryList';
import { clearAssistantChat, setAssistantOpen, useAssistantChat } from './assistantStore';

// The assistant as a full page, shared by HR and Admin: the same conversation as the small floating window, with
// the saved chats always visible on the left from tablet width up (phones use the History button in the header).
export function AssistantPage({ role }: { role: 'hr' | 'admin' }) {
  const router = useRouter();
  const { chatId, loading } = useAssistantChat();
  return (
    <div className="mx-auto flex h-[calc(100vh-11rem)] min-h-[420px] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50 md:flex" aria-label="Past chats">
        <div className="border-b border-slate-200 p-3">
          <button
            type="button"
            onClick={clearAssistantChat}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> New chat
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <ChatHistoryList activeId={chatId} refreshKey={`${chatId ?? ''}:${loading}`} />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <ChatPanel variant="page" role={role} historyDocked onMinimise={() => { setAssistantOpen(true); router.push(`/${role}`); }} />
      </div>
    </div>
  );
}
