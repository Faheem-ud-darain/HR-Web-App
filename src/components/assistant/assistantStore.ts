'use client';

// One conversation shared by the small floating window and the full-page view, so expanding or
// minimising continues the same chat. Kept in this tab's sessionStorage (cleared when the tab closes);
// the server-side, HR/Admin-only log that survives is a later stage (it needs a new collection).
import { useSyncExternalStore } from 'react';
import { getAuthToken } from '@/lib/session';
import { API_BASE } from '@/lib/apiBase';

export interface AssistantAction { type: 'open_page' | 'ask_followup'; label: string; page?: string; search?: string; text?: string }
export interface AssistantMessage { id: string; role: 'user' | 'assistant'; content: string; toolsUsed?: string[]; actions?: AssistantAction[]; demo?: boolean; error?: boolean }
interface State { messages: AssistantMessage[]; loading: boolean; chatId?: string }
export interface SavedChatRow { id: string; title: string; updated: string }

const KEY = 'assistant_chat_v1';
const ID_KEY = 'assistant_chat_id_v1';
const EMPTY: State = { messages: [], loading: false };
let state: State = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load(): void {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) state = { messages: (JSON.parse(raw) as AssistantMessage[]).slice(-40), loading: false, chatId: window.sessionStorage.getItem(ID_KEY) || undefined };
  } catch { /* unreadable storage: start empty */ }
}
function set(next: State): void {
  state = next;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next.messages.slice(-40)));
    if (next.chatId) window.sessionStorage.setItem(ID_KEY, next.chatId); else window.sessionStorage.removeItem(ID_KEY);
  } catch { /* ignore */ }
  listeners.forEach(l => l());
}
function subscribe(l: () => void): () => void { listeners.add(l); return () => listeners.delete(l); }
const snapshot = (): State => { load(); return state; };
const serverSnapshot = (): State => EMPTY;

// `epoch` changes whenever the active chat is replaced (new chat, opened chat, deleted chat). A reply or a
// save that started under an older epoch is dropped, so it can never land in (or re-tag) a different chat.
let epoch = 0;
let openGen = 0; // the latest "open a saved chat" request; older ones are ignored when they come back
const newId = () => Math.random().toString(36).slice(2, 10);

export function useAssistantChat() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** Starts a fresh chat. The one being left stays in the saved history. */
export function clearAssistantChat(): void {
  openGen++;
  epoch++;
  set({ messages: [], loading: false });
}

// --- Saved chats (private to the signed-in user; stored by /api/assistant/history) -----------------------
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` });
let historyOff = false; // the server said saving is not set up: stop trying for this tab

// Saves run one at a time, so two quick replies cannot both create the same chat twice: each save reads the
// chat's id only when it starts, after the one before it has finished.
let saveQueue: Promise<void> = Promise.resolve();
function queueSave(): void {
  const at = epoch;
  saveQueue = saveQueue.then(() => saveCurrentChat(at)).catch(() => { /* best effort */ });
}

async function saveCurrentChat(at: number): Promise<void> {
  if (historyOff || at !== epoch) return;
  const sent = state.messages.filter(m => !m.error);
  if (!sent.some(m => m.role === 'user')) return;
  try {
    const res = await fetch(`${API_BASE}/api/assistant/history`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ id: state.chatId, messages: sent }), signal: AbortSignal.timeout(15_000) });
    if (res.status === 503) { historyOff = true; return; }
    const data = await res.json().catch(() => ({})) as { id?: string };
    if (at === epoch && res.ok && data.id && data.id !== state.chatId) set({ ...state, chatId: data.id });
  } catch { /* saving is best effort: the chat itself is unaffected */ }
}

export async function listSavedChats(): Promise<{ available: boolean; chats: SavedChatRow[] }> {
  try {
    const res = await fetch(`${API_BASE}/api/assistant/history`, { headers: authHeaders(), signal: AbortSignal.timeout(15_000) });
    const data = await res.json().catch(() => ({})) as { available?: boolean; chats?: SavedChatRow[] };
    if (!res.ok) return { available: true, chats: [] };
    return { available: data.available !== false, chats: data.chats ?? [] };
  } catch { return { available: true, chats: [] }; }
}

export async function openSavedChat(id: string): Promise<boolean> {
  const mine = ++openGen;
  try {
    const res = await fetch(`${API_BASE}/api/assistant/history?id=${encodeURIComponent(id)}`, { headers: authHeaders(), signal: AbortSignal.timeout(15_000) });
    const data = await res.json().catch(() => ({})) as { chat?: { id: string; messages: AssistantMessage[] } };
    if (!res.ok || !data.chat || mine !== openGen) return false;
    epoch++;
    set({ messages: data.chat.messages.slice(-40), loading: false, chatId: data.chat.id });
    return true;
  } catch { return false; }
}

/** True only when the server confirmed the chat is gone. */
export async function deleteSavedChat(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/assistant/history?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders(), signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return false;
  } catch { return false; }
  load();
  if (state.chatId === id) { openGen++; epoch++; set({ messages: [], loading: false }); }
  return true;
}

export async function sendAssistantMessage(text: string): Promise<void> {
  const content = text.trim();
  load();
  if (!content || state.loading) return;
  const withUser: AssistantMessage[] = [...state.messages, { id: newId(), role: 'user', content: content.slice(0, 2000) }];
  set({ ...state, messages: withUser, loading: true });
  const at = epoch;
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
    if (at !== epoch) return; // the chat was replaced while this was being answered
    set({ ...state, messages: [...state.messages, { id: newId(), role: 'assistant', content: data.answer, toolsUsed: data.toolsUsed, actions: data.actions, demo: data.demo }], loading: false });
    queueSave();
  } catch (err) {
    if (at !== epoch) return;
    set({ ...state, messages: [...state.messages, { id: newId(), role: 'assistant', content: err instanceof Error && err.name !== 'TimeoutError' && err.name !== 'AbortError' ? err.message : 'That took too long, so I stopped. Please try again.', error: true }], loading: false });
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
