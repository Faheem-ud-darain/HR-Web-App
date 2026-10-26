'use client';

// One conversation shared by the small floating window and the full-page view, so expanding or
// minimising continues the same chat. Kept in this tab's sessionStorage (cleared when the tab closes);
// the server-side, HR/Admin-only log that survives is a later stage (it needs a new collection).
import { useSyncExternalStore } from 'react';
import { getAuthToken } from '@/lib/session';
import { API_BASE } from '@/lib/apiBase';

export interface AssistantAction { type: 'open_page' | 'ask_followup'; label: string; page?: string; search?: string; text?: string }
export interface AssistantMessage { id: string; role: 'user' | 'assistant'; content: string; toolsUsed?: string[]; actions?: AssistantAction[]; demo?: boolean; error?: boolean }
interface State { messages: AssistantMessage[]; loading: boolean }

const KEY = 'assistant_chat_v1';
const EMPTY: State = { messages: [], loading: false };
let state: State = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load(): void {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) state = { messages: (JSON.parse(raw) as AssistantMessage[]).slice(-40), loading: false };
  } catch { /* unreadable storage: start empty */ }
}
function set(next: State): void {
  state = next;
  try { window.sessionStorage.setItem(KEY, JSON.stringify(next.messages.slice(-40))); } catch { /* ignore */ }
  listeners.forEach(l => l());
}
function subscribe(l: () => void): () => void { listeners.add(l); return () => listeners.delete(l); }
const snapshot = (): State => { load(); return state; };
const serverSnapshot = (): State => EMPTY;

const newId = () => Math.random().toString(36).slice(2, 10);

export function useAssistantChat() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export function clearAssistantChat(): void {
  set({ messages: [], loading: false });
}

export async function sendAssistantMessage(text: string): Promise<void> {
  const content = text.trim();
  load();
  if (!content || state.loading) return;
  const withUser: AssistantMessage[] = [...state.messages, { id: newId(), role: 'user', content: content.slice(0, 2000) }];
  set({ messages: withUser, loading: true });
  try {
    const token = getAuthToken();
    const history = withUser.filter(m => !m.error).map(m => ({ role: m.role, content: m.content }));
    // Give up after 70 seconds instead of showing "Thinking…" forever if the request gets stuck.
    const res = await fetch(`${API_BASE}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: history }),
      signal: AbortSignal.timeout(70_000),
    });
    const data = await res.json().catch(() => ({})) as { answer?: string; toolsUsed?: string[]; actions?: AssistantAction[]; demo?: boolean; error?: string };
    if (!res.ok || !data.answer) throw new Error(data.error || 'The assistant could not answer.');
    set({ messages: [...state.messages, { id: newId(), role: 'assistant', content: data.answer, toolsUsed: data.toolsUsed, actions: data.actions, demo: data.demo }], loading: false });
  } catch (err) {
    set({ messages: [...state.messages, { id: newId(), role: 'assistant', content: err instanceof Error && err.name !== 'TimeoutError' && err.name !== 'AbortError' ? err.message : 'That took too long, so I stopped. Please try again.', error: true }], loading: false });
  }
}

// Whether the small floating window is open. Shared so the full-page view can hand back to it.
let windowOpen = false;
const openListeners = new Set<() => void>();
export function setAssistantOpen(open: boolean): void { windowOpen = open; openListeners.forEach(l => l()); }
const subscribeOpen = (l: () => void) => { openListeners.add(l); return () => openListeners.delete(l); };
export function useAssistantOpen(): boolean {
  return useSyncExternalStore(subscribeOpen, () => windowOpen, () => false);
}

// The orb is drawn directly on the page with no background: brand orange ink (use a near-black such as #0f172a for a black orb).
export const ORB_COLOR = '#c2410c';

// Dot size multiplier for the orb (1 = the library's tuned look, 1.5 = bolder).
export const ORB_DOT_SIZE = 1.8; // idle (listening) only: bold
export const ORB_BUSY_DOT_SIZE = 1; // every other state: the library's normal dots

// Orb animation speed (1 = the library's tuned speed): calm while idle, a little livelier while thinking.
export const ORB_IDLE_SPEED = 0.4;
export const ORB_BUSY_SPEED = 0.75;
