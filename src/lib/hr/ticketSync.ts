// Pure helpers behind the ticket poll and ticket replies (no PocketBase / React imports).
//
// 1. Poll without the heavy payload. A ticket's replies are a JSON column that can hold base64
//    attachments (megabytes), and PocketBase's `fields=` can only drop whole columns, not parts of
//    one. So the 30-second poll asks for every column EXCEPT `replies`, and only the tickets whose
//    `updated` stamp changed (or that we have never seen) get their replies fetched again.
// 2. Append a reply to the replies as they are stored NOW, and detect a lost update through the
//    `updated` stamp. PocketBase 0.22 has no compare-and-swap, so this narrows the race rather than
//    closing it completely (a write landing between the final check and our PATCH can still win).

export const TICKET_LIGHT_FIELDS = 'id,created,updated,employee_name,employee_email,subject,description,department,status';

export interface ReplyCacheEntry { updated: string; replies: unknown[] }

// Ids whose replies must be (re)fetched: never seen, or `updated` changed since we cached them.
export function ticketsNeedingReplies(light: { id: string; updated?: string }[], cache: Map<string, ReplyCacheEntry>): string[] {
  return light.filter(t => {
    const hit = cache.get(t.id);
    return !hit || !t.updated || hit.updated !== t.updated;
  }).map(t => t.id);
}

export interface AppendReplyDeps<R> {
  // Latest stored ticket (replies + updated stamp).
  read: () => Promise<{ updated: string; replies: R[] }>;
  // Just the updated stamp, cheap.
  readUpdated: () => Promise<string>;
  write: (replies: R[]) => Promise<void>;
}

export async function appendReplyWithRetry<R extends { id: string }>(deps: AppendReplyDeps<R>, reply: R, maxAttempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const latest = await deps.read();
    if (latest.replies.some(r => r.id === reply.id)) return; // already stored (earlier attempt landed)
    // Someone wrote since we read? Then start over from their version instead of overwriting it.
    if (attempt < maxAttempts && (await deps.readUpdated()) !== latest.updated) continue;
    await deps.write([...latest.replies, reply]);
    return;
  }
}
