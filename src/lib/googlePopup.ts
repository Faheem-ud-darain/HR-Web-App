// The page the Google sign-in pop-up ends on: it hands ONE message to the window that opened it. Everything in the message is data, never
// markup: it is written as JSON with the characters that could end the script or the page escaped, so text that arrives in the address
// (for example ?error=...) can never run as code. The message goes only to this same site, not to "any" window.
export type GooglePopupMessage = { type: 'GOOGLE_AUTH_SUCCESS'; email: string } | { type: 'GOOGLE_AUTH_ERROR'; error: string };

const MAX_TEXT = 300;

export function popupResultHtml(message: GooglePopupMessage): string {
  const text = (value: string) => String(value ?? '').slice(0, MAX_TEXT);
  const safe: GooglePopupMessage = message.type === 'GOOGLE_AUTH_SUCCESS'
    ? { type: message.type, email: text(message.email) }
    : { type: message.type, error: text(message.error) };
  const json = JSON.stringify(safe)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!doctype html><html><body><script>if (window.opener) window.opener.postMessage(${json}, window.location.origin);</script></body></html>`;
}

export function popupResponse(message: GooglePopupMessage): Response {
  return new Response(popupResultHtml(message), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
