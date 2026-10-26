import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { getAssistantDb } from '@/lib/server/assistantDb';
import { chatTitle, cleanChatForSave, MAX_SAVED_CHATS, retentionCutoff } from '@/lib/assistant/history';

export const runtime = 'edge';

// Each HR/Admin user's saved chats with Del. Private to the signed-in user: every read, write and delete
// is filtered by their own e-mail from the session, never by anything the browser sends. Nobody (Admin
// included) can open someone else's chat through this route. Chats older than 30 days are deleted.
//   GET    -> { available, chats: [{ id, title, updated }] }        list (newest first)
//   GET ?id=…  -> { chat: { id, title, messages } }                 one chat
//   PUT    { id?, messages } -> { id }                              save (creates when no id)
//   DELETE ?id=…                                                    remove one chat
// Stored in the Cloudflare D1 database bound as ASSISTANT_DB (table in d1/assistant_chats.sql). With no
// binding, GET answers { available: false } and the screen hides History.
const validId = (id: string) => /^[A-Za-z0-9]{6,30}$/.test(id);
const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);

async function auth(request: Request): Promise<string | NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  if (session.role !== 'hr' && session.role !== 'admin') return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  return session.email.toLowerCase();
}

export async function GET(request: Request) {
  const owner = await auth(request);
  if (typeof owner !== 'string') return owner;
  const db = getAssistantDb();
  if (!db) return NextResponse.json({ available: false, chats: [] });
  const id = new URL(request.url).searchParams.get('id') || '';
  try {
    if (id) {
      if (!validId(id)) return NextResponse.json({ error: 'Chat not found.' }, { status: 404 });
      const row = await db.prepare('SELECT id, title, messages FROM assistant_chats WHERE id = ? AND owner = ?').bind(id, owner).first<{ id: string; title: string; messages: string }>();
      if (!row) return NextResponse.json({ error: 'Chat not found.' }, { status: 404 });
      let messages: unknown = [];
      try { messages = JSON.parse(row.messages); } catch { /* unreadable: show it empty */ }
      return NextResponse.json({ chat: { id: row.id, title: row.title, messages: Array.isArray(messages) ? messages : [] } });
    }
    // Tidy up this user's expired chats whenever they open the list.
    await db.prepare('DELETE FROM assistant_chats WHERE owner = ? AND updated < ?').bind(owner, retentionCutoff()).run();
    const list = await db.prepare('SELECT id, title, updated FROM assistant_chats WHERE owner = ? ORDER BY updated DESC LIMIT ?').bind(owner, MAX_SAVED_CHATS).all<{ id: string; title: string; updated: string }>();
    return NextResponse.json({ available: true, chats: list.results ?? [] });
  } catch (err) {
    console.error('[assistant/history GET] failed:', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'Could not load your chats.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const owner = await auth(request);
  if (typeof owner !== 'string') return owner;
  const db = getAssistantDb();
  if (!db) return NextResponse.json({ available: false }, { status: 503 });
  let body: { id?: unknown; messages?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const messages = cleanChatForSave(body.messages);
  if (!messages) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  const title = chatTitle(messages);
  const json = JSON.stringify(messages);
  const now = new Date().toISOString().replace('T', ' ');
  try {
    if (typeof body.id === 'string' && body.id) {
      if (!validId(body.id)) return NextResponse.json({ error: 'Chat not found.' }, { status: 404 });
      // Only ever update a chat that belongs to this user.
      const existing = await db.prepare('SELECT id FROM assistant_chats WHERE id = ? AND owner = ?').bind(body.id, owner).first();
      if (existing) {
        await db.prepare('UPDATE assistant_chats SET title = ?, messages = ?, updated = ? WHERE id = ? AND owner = ?').bind(title, json, now, body.id, owner).run();
        return NextResponse.json({ id: body.id });
      }
    }
    const id = newId();
    await db.prepare('INSERT INTO assistant_chats (id, owner, title, messages, updated) VALUES (?, ?, ?, ?, ?)').bind(id, owner, title, json, now).run();
    return NextResponse.json({ id });
  } catch (err) {
    console.error('[assistant/history PUT] failed:', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'Could not save this chat.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const owner = await auth(request);
  if (typeof owner !== 'string') return owner;
  const db = getAssistantDb();
  if (!db) return NextResponse.json({ available: false }, { status: 503 });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!validId(id)) return NextResponse.json({ error: 'Chat not found.' }, { status: 404 });
  try {
    await db.prepare('DELETE FROM assistant_chats WHERE id = ? AND owner = ?').bind(id, owner).run();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[assistant/history DELETE] failed:', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'Could not delete this chat.' }, { status: 500 });
  }
}
