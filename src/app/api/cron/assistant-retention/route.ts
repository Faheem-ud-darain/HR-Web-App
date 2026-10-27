import { NextResponse } from 'next/server';
import { getAssistantDb } from '@/lib/server/assistantDb';
import { retentionCutoff } from '@/lib/assistant/history';

export const runtime = 'edge';

// Nightly sweep of saved assistant chats older than the retention period (30 days), for everybody. Called by
// the Cloudflare cron Worker (workers/cron). Chats past the cutoff are also hidden from reads straight away
// (see api/assistant/history), so this is only the housekeeping that removes them for good.
//
// POST /api/cron/assistant-retention
//   Authorization: Bearer <CRON_SECRET>

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET || '';
  if (secret.length < 24) return NextResponse.json({ error: 'The cron secret is not configured.' }, { status: 503 });
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!sameSecret(given, secret)) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  const db = getAssistantDb();
  if (!db) return NextResponse.json({ status: 'not_configured' });
  try {
    await db.prepare('DELETE FROM assistant_chats WHERE updated < ?').bind(retentionCutoff()).run();
    return NextResponse.json({ status: 'swept' });
  } catch (err) {
    console.error('[cron/assistant-retention] failed:', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'The sweep failed.' }, { status: 500 });
  }
}
