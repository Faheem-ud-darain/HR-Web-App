// Rules for saved assistant chats (plain TypeScript, no I/O). Each HR/Admin user's chats are stored under
// their own account and nobody else's. Bank numbers are masked before a chat is saved, so a stored chat
// can never leak a full account number later.
export const HISTORY_RETENTION_DAYS = 30;
export const MAX_SAVED_CHATS = 50;
const MAX_MESSAGES = 40;
const MAX_CONTENT = 8000;
const MAX_ACTIONS = 6;

export interface SavedAction { type: 'open_page' | 'ask_followup'; label: string; page?: string; search?: string; text?: string }
export interface SavedMessage { id: string; role: 'user' | 'assistant'; content: string; toolsUsed?: string[]; actions?: SavedAction[]; error?: boolean }

// An IBAN, or any run of 10+ digits (spaces/hyphens allowed between them). Calendar dates such as
// 2026-10-26 are left alone. Only the last four digits stay visible.
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;
const LONG_NUMBER = /(?!\d{4}-\d{2}-\d{2}\b)\b\d(?:[ -]?\d){9,}\b/g;

export function maskBankNumbers(text: string): string {
  const tail = (s: string) => `••••${s.replace(/[^A-Za-z0-9]/g, '').slice(-4)}`;
  return text.replace(IBAN, m => tail(m)).replace(LONG_NUMBER, m => tail(m));
}

/** The first question, shortened, becomes the chat's title in the history list. */
export function chatTitle(messages: Pick<SavedMessage, 'role' | 'content'>[]): string {
  const first = messages.find(m => m.role === 'user')?.content.replace(/\s+/g, ' ').trim() || 'New chat';
  return first.length > 60 ? `${first.slice(0, 57)}…` : first;
}

/** Validates what the browser sends: right shape, capped sizes, bank numbers masked. Returns null when there is nothing to save. */
export function cleanChatForSave(input: unknown): SavedMessage[] | null {
  if (!Array.isArray(input)) return null;
  const out: SavedMessage[] = [];
  for (const raw of input.slice(-MAX_MESSAGES)) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as Record<string, unknown>;
    if ((m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || !m.content.trim()) continue;
    const msg: SavedMessage = {
      id: typeof m.id === 'string' ? m.id.slice(0, 20) : Math.random().toString(36).slice(2, 10),
      role: m.role,
      content: maskBankNumbers(m.content.slice(0, MAX_CONTENT)),
    };
    if (m.error === true) msg.error = true;
    if (Array.isArray(m.toolsUsed)) msg.toolsUsed = m.toolsUsed.filter((t): t is string => typeof t === 'string').slice(0, 12).map(t => t.slice(0, 40));
    if (Array.isArray(m.actions)) {
      msg.actions = m.actions.slice(0, MAX_ACTIONS).flatMap((a): SavedAction[] => {
        const x = a as Record<string, unknown>;
        if (!x || typeof x.label !== 'string' || (x.type !== 'open_page' && x.type !== 'ask_followup')) return [];
        const act: SavedAction = { type: x.type, label: maskBankNumbers(x.label.slice(0, 80)) };
        if (typeof x.page === 'string') act.page = x.page.slice(0, 40);
        if (typeof x.search === 'string') act.search = maskBankNumbers(x.search.slice(0, 80));
        if (typeof x.text === 'string') act.text = maskBankNumbers(x.text.slice(0, 300));
        return [act];
      });
    }
    out.push(msg);
  }
  return out.some(m => m.role === 'user') ? out : null;
}

/** ISO cutoff (PocketBase format) before which saved chats are deleted. */
export function retentionCutoff(now = Date.now()): string {
  return new Date(now - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ');
}
