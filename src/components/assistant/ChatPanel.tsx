'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { ArrowUp, Check, Copy, ExternalLink, History, Maximize2, Minimize2, MessageCircle, SquarePen, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Markdown } from './Markdown';
import { personaFor } from '@/lib/assistant/persona';
import { clearAssistantChat, deleteSavedChat, listSavedChats, openSavedChat, type SavedChatRow, ORB_BUSY_DOT_SIZE, ORB_BUSY_SPEED, ORB_COLOR, ORB_DOT_SIZE, ORB_IDLE_SPEED, sendAssistantMessage, useAssistantChat, type AssistantAction } from './assistantStore';

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    onChange => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

const SUGGESTIONS = [
  'Why does Ali have deductions this month?',
  'Who has reserved salary?',
  'How many leaves did Sara Khan request this month?',
  'Which trackers have problems?',
  'Draft a reply to ticket 42',
  'Is Sara paid for September?',
];

const TOOL_LABEL: Record<string, string> = {
  find_employee: 'employee lookup', explain_pay: 'pay', leave_summary: 'leave', reserved_overview: 'reserved salary',
  activity_facts: 'work activity', bank_details: 'bank details', get_ticket: 'ticket', tracker_health: 'trackers', payroll_overview: 'payroll',
};

interface Props { variant: 'window' | 'page'; role: 'hr' | 'admin'; onExpand?: () => void; onMinimise?: () => void; onClose?: () => void }

/** Copies an answer to the clipboard (for pasting a drafted reply into a ticket). */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ }
      }}
      aria-label="Copy this answer"
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
    >
      {done ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

/** The signed-in user's own saved chats: reopen one to carry on, or delete it. */
function HistoryList({ onPicked }: { onPicked: () => void }) {
  const [rows, setRows] = useState<SavedChatRow[] | null>(null);
  const [available, setAvailable] = useState(true);
  useEffect(() => {
    let alive = true;
    void listSavedChats().then(r => { if (alive) { setRows(r.chats); setAvailable(r.available); } });
    return () => { alive = false; };
  }, []);
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
          <li key={r.id} className="group flex items-center gap-1 rounded-lg hover:bg-slate-50">
            <button type="button" onClick={async () => { if (await openSavedChat(r.id)) onPicked(); }} className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left">
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

export function ChatPanel({ variant, role, onExpand, onMinimise, onClose }: Props) {
  const { messages, loading } = useAssistantChat();
  const router = useRouter();
  const persona = personaFor(role);
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, loading]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Buttons only open a page or ask a question: the assistant itself never changes anything.
  const runAction = (a: AssistantAction) => {
    if (a.type === 'ask_followup' && a.text) { void sendAssistantMessage(a.text); return; }
    if (a.type === 'open_page' && a.page) {
      router.push(`/${role}/${a.page}`);
      // Pages with a search (payroll, leaves) listen for this event; others simply open.
      if (a.search) setTimeout(() => window.dispatchEvent(new CustomEvent('globalSearch', { detail: a.search })), 900);
    }
  };

  const submit = (text: string) => {
    if (!text.trim() || loading) return;
    setDraft('');
    void sendAssistantMessage(text);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden="true">
          <ThinkingOrb state={loading ? 'solving' : 'listening'} speed={loading ? ORB_BUSY_SPEED : ORB_IDLE_SPEED} size={20} theme="light" color={ORB_COLOR} dotSize={loading ? ORB_BUSY_DOT_SIZE : ORB_DOT_SIZE} paused={reduced} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold leading-tight text-slate-900">Del</h2>
          <p className="truncate text-[11px] text-slate-500">{persona.tagline}</p>
        </div>
        {messages.length > 0 && (
          <button type="button" onClick={() => { clearAssistantChat(); setShowHistory(false); }} aria-label="New chat" title="New chat" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            <SquarePen className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <button type="button" onClick={() => setShowHistory(v => !v)} aria-label="Past chats" aria-pressed={showHistory} title="Past chats" className={`rounded-lg p-2 hover:bg-slate-100 hover:text-slate-800 ${showHistory ? 'bg-slate-100 text-slate-800' : 'text-slate-500'}`}>
          <History className="h-4 w-4" aria-hidden="true" />
        </button>
        {variant === 'window' && onExpand && (
          <button type="button" onClick={onExpand} aria-label="Open in full page" title="Open in full page" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {variant === 'page' && onMinimise && (
          <button type="button" onClick={onMinimise} aria-label="Minimise to the small window" title="Minimise" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            <Minimize2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {variant === 'window' && onClose && (
          <button type="button" onClick={onClose} aria-label="Close assistant" title="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {showHistory && <HistoryList onPicked={() => setShowHistory(false)} />}
      <div className={`min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 ${showHistory ? 'hidden' : ''}`} aria-live="polite">
        {messages.length === 0 && (
          <div>
            <p className="text-sm text-slate-700">Good day, {persona.addressAs}. I am Del, your personal assistant. I can look into pay, leave, absences, tickets and trackers on your behalf. I only read information and cannot change anything.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map(s => (
                <button key={s} type="button" onClick={() => submit(s)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            {m.role === 'user' ? (
              <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-slate-900 px-3.5 py-2 text-sm text-white">{m.content}</div>
            ) : (
              <div className={`max-w-[95%] rounded-2xl rounded-bl-md border px-3.5 py-2.5 ${m.error ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}>
                {m.error ? <p className="text-sm text-rose-700">{m.content}</p> : <Markdown text={m.content} />}
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {m.actions.map((a, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => runAction(a)}
                        disabled={loading && a.type === 'ask_followup'}
                        className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 hover:border-orange-300 hover:bg-orange-100 disabled:opacity-50"
                      >
                        {a.type === 'open_page' ? <ExternalLink className="h-3 w-3" aria-hidden="true" /> : <MessageCircle className="h-3 w-3" aria-hidden="true" />}
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
                {!m.error && (
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-400">{m.toolsUsed && m.toolsUsed.length > 0 ? `Checked: ${[...new Set(m.toolsUsed.map(t => TOOL_LABEL[t] ?? t))].join(', ')}` : ''}</p>
                    <CopyButton text={m.content} />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-500" role="status">
            <span className="flex h-6 w-6 items-center justify-center" aria-hidden="true">
              <ThinkingOrb state="solving" speed={ORB_BUSY_SPEED} size={20} theme="light" color={ORB_COLOR} dotSize={ORB_BUSY_DOT_SIZE} paused={reduced} aria-hidden="true" />
            </span>
            Looking into it…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={e => { e.preventDefault(); submit(draft); }} className="border-t border-slate-200 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 focus-within:border-slate-500">
          <label htmlFor={`assistant-input-${variant}`} className="sr-only">Ask the assistant</label>
          <textarea
            id={`assistant-input-${variant}`}
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(draft); } }}
            rows={1}
            maxLength={2000}
            placeholder="How may I assist you?"
            className="max-h-28 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button type="submit" disabled={!draft.trim() || loading} aria-label="Send" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white disabled:bg-slate-300">
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-slate-400">Del is an AI assistant and may make errors. Please verify the details before acting.</p>
      </form>
    </div>
  );
}
