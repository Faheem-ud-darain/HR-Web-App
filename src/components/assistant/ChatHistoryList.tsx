'use client';

import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteSavedChat, listSavedChats, openSavedChat, type SavedChatRow } from './assistantStore';

/** The signed-in user's own saved chats: reopen one to carry on, or delete it. */
export function ChatHistoryList({ onPicked, activeId, refreshKey }: { onPicked?: () => void; activeId?: string; refreshKey?: string }) {
  const [rows, setRows] = useState<SavedChatRow[] | null>(null);
  const [available, setAvailable] = useState(true);
  // `refreshKey` changes when the current chat is saved or switched, so a list that stays on screen (the full page's
  // left column) picks up the new chat without being reopened.
  useEffect(() => {
    let alive = true;
    void listSavedChats().then(r => { if (alive) { setRows(r.chats); setAvailable(r.available); } });
    return () => { alive = false; };
  }, [refreshKey]);
  const when = (u: string) => {
    const d = new Date(u.replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <p className="px-1 pb-2 text-[11px] text-slate-500">Your past chats. Only you can see these, and they are removed after 30 days. Bank numbers are saved masked.</p>
      {rows === null && <p className="px-1 text-sm text-slate-500" role="status">Loading…</p>}
      {rows !== null && !available && <p className="px-1 text-sm text-slate-600">Saved chats are not switched on yet.</p>}
      {rows !== null && available && rows.length === 0 && <p className="px-1 text-sm text-slate-600">No saved chats yet. Your next conversation will appear here.</p>}
      <ul className="space-y-1">
        {(rows ?? []).map(r => (
          <li key={r.id} className={`group flex items-center gap-1 rounded-lg hover:bg-slate-50 ${r.id === activeId ? 'bg-slate-100' : ''}`}>
            <button type="button" onClick={async () => { if (await openSavedChat(r.id)) onPicked?.(); }} className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left">
              <span className="block truncate text-sm font-medium text-slate-800">{r.title}</span>
              <span className="block text-[11px] text-slate-400">{when(r.updated)}</span>
            </button>
            <button
              type="button"
              onClick={async () => { if (await deleteSavedChat(r.id)) setRows(cur => (cur ?? []).filter(x => x.id !== r.id)); }}
              aria-label={`Delete chat: ${r.title}`}
              title="Delete this chat"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-200/60 hover:text-rose-600"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
