// The Cloudflare D1 database that holds saved assistant chats. On Cloudflare Pages it is a binding named
// ASSISTANT_DB (Pages → Settings → Bindings). Where there is no binding (local `next dev`, or before it is
// added) this returns null and the chat history simply switches itself off.
export interface D1Result<T> { results?: T[] }
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface D1Database { prepare(sql: string): D1Statement }

export function getAssistantDb(): D1Database | null {
  // next-on-pages publishes the request's bindings under this well-known symbol.
  const ctx = (globalThis as unknown as Record<symbol, { env?: Record<string, unknown> } | undefined>)[Symbol.for('__cloudflare-request-context__')];
  const db = ctx?.env?.ASSISTANT_DB as D1Database | undefined;
  return db && typeof db.prepare === 'function' ? db : null;
}
