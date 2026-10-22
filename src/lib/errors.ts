/** Message from an unknown thrown value (catch clauses are `unknown`, not `any`). */
export function errMsg(e: unknown, fallback = ''): string {
  if (e instanceof Error) return e.message || fallback;
  if (typeof e === 'string') return e || fallback;
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
  }
  return fallback;
}
