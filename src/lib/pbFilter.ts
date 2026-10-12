// Binds values into a PocketBase filter expression via the SDK's own
// `{:name}` placeholder support, so callers never hand-escape quotes and a
// stray `"`, `'` or `||` in user-supplied text can't change the filter's
// meaning. Safe on both the browser and the Edge runtime (a bare PocketBase
// instance makes no network calls until you use it), so client code in
// src/lib/hr/* and server code in src/lib/pbAdmin.ts share this one helper.
//   pbFilter('email ~ {:email} && status = {:status}', { email, status })
import PocketBase from 'pocketbase';

const binder = new PocketBase();

export function pbFilter(expr: string, params: Record<string, unknown>): string {
  return binder.filter(expr, params);
}
