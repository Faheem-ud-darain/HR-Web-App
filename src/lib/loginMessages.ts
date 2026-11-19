// What to tell the person when the login request did not succeed. Only a real answer from the login service means a wrong password: a web page from
// Cloudflare (a 502 or 522 error page), an empty reply or a server error does not, and saying "Invalid email or password" for those sent people off
// to reset passwords that were never wrong.
export function loginFailureMessage(status: number, body: { error?: unknown } | null): string {
  if (typeof body?.error === 'string' && body.error) return body.error;
  if (status === 401) return 'Invalid email or password.';
  if (status === 429) return 'Too many sign-in attempts. Please wait a few minutes and try again.';
  if (status >= 500) return `The sign-in service had a problem (error ${status}). Your password is not the issue; please try again in a moment.`;
  return `Sign-in did not go through (error ${status}). Please try again.`;
}
