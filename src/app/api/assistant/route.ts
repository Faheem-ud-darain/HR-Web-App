import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { runAssistant, type ChatMessage } from '@/lib/assistant/chat';
import { runTicketDraft, type TicketDraftInput } from '@/lib/assistant/draft';
import { createLiveRunner } from '@/lib/assistant/live';

export const runtime = 'edge';

// HR/Admin-only assistant (plan 030). Read-only: it can only run the fixed tools in lib/assistant/tools.ts.
// PROTOTYPE: the tools read made-up demo data, never the database, until the owner accepts the model
// providers' data terms and the database lock-down is done.
//
// POST /api/assistant  { messages: [{ role: 'user' | 'assistant', content: string }] }
//   -> { answer, toolsUsed, model, demo: true }

// Small in-memory guard (per server instance). The real one will count per user per day in the app's store.
const recent = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 30;

function tooMany(key: string): boolean {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter(t => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) { recent.set(key, hits); return true; }
  hits.push(now);
  recent.set(key, hits);
  return false;
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  // Admin and HR only. Employees (and team leads) never get the assistant, whatever the screen shows.
  if (session.role !== 'hr' && session.role !== 'admin') return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });

  // The data mode must be chosen explicitly: 'live' (the real database) or 'demo' (made-up people, for local
  // testing only). With nothing set, the assistant is switched off, so made-up data can never be mistaken for real.
  const dataMode = process.env.ASSISTANT_DATA;
  const apiKey = process.env.GROQ_API_KEY || '';
  if ((dataMode !== 'live' && dataMode !== 'demo') || !apiKey) return NextResponse.json({ error: 'The assistant has not been switched on yet.' }, { status: 503 });

  let body: { messages?: ChatMessage[]; ticketDraft?: TicketDraftInput };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const isDraft = !!body.ticketDraft && typeof body.ticketDraft === 'object';
  if (!isDraft && (!Array.isArray(body.messages) || body.messages.length === 0)) return NextResponse.json({ error: 'Send a message.' }, { status: 400 });

  if (tooMany(`assistant_${session.email}`)) {
    return NextResponse.json({ error: 'You are asking quickly. Give it a minute and try again.' }, { status: 429 });
  }

  try {
    if (isDraft) {
      const t = body.ticketDraft as TicketDraftInput;
      if (typeof t.title !== 'string' || typeof t.description !== 'string' || typeof t.employeeName !== 'string') return NextResponse.json({ error: 'Invalid ticket.' }, { status: 400 });
      return NextResponse.json({ ...(await runTicketDraft({ title: t.title, description: t.description, employeeName: t.employeeName, replies: Array.isArray(t.replies) ? t.replies : [] }, apiKey)), demo: false });
    }
    const live = dataMode === 'live';
    const result = await runAssistant(body.messages as ChatMessage[], apiKey, { role: session.role, ...(live ? { runner: createLiveRunner() } : {}) });
    return NextResponse.json({ ...result, demo: !live });
  } catch (err) {
    console.error('[assistant] failed:', err instanceof Error ? err.message : 'error');
    // Both free models are at their limit: say so plainly, so people know to wait instead of retrying.
    if ((err as { status?: number })?.status === 429) {
      return NextResponse.json({ error: "Del has reached today's free usage limit for the moment. Please try again in a minute or two." }, { status: 429 });
    }
    return NextResponse.json({ error: 'The assistant is busy or unavailable right now. Please try again in a moment.' }, { status: 502 });
  }
}
