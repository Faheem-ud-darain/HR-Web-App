import { describe, expect, it } from 'vitest';
import { popupResultHtml } from './googlePopup';
import { dataUrlToBlob, MAX_PICTURE_BYTES } from './dataUrl';

// The text a script would be built from: everything between the opening and closing script tags.
const scriptOf = (html: string) => html.split('<script>')[1].split('</script>')[0];

describe('Google pop-up result page', () => {
  it('never lets text from the address run as code (reflected XSS)', () => {
    const attack = `');alert(document.domain)//</script><script>alert(1)</script>`;
    const html = popupResultHtml({ type: 'GOOGLE_AUTH_ERROR', error: attack });
    expect(html.match(/<script>/g)).toHaveLength(1); // the injected closing/opening tags did not survive
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    // Run the page's script for real: the injected alert must never be called, and the message must arrive exactly as sent.
    let alerted = false;
    const posted: unknown[] = [];
    const fakeWindow = { opener: { postMessage: (m: unknown) => posted.push(m) }, location: { origin: 'https://hub.example' } };
    new Function('window', 'alert', scriptOf(html))(fakeWindow, () => { alerted = true; });
    expect(alerted).toBe(false);
    expect(posted).toEqual([{ type: 'GOOGLE_AUTH_ERROR', error: attack }]);
  });
  it('posts only to this site, not to any window', () => {
    const script = scriptOf(popupResultHtml({ type: 'GOOGLE_AUTH_SUCCESS', email: 'a@b.com' }));
    expect(script).toContain('window.location.origin');
    expect(script).not.toContain("'*'");
    expect(script).not.toContain('"*"');
  });
  it('caps very long text', () => {
    const html = popupResultHtml({ type: 'GOOGLE_AUTH_ERROR', error: 'x'.repeat(5000) });
    expect(html.length).toBeLessThan(1000);
  });
});

describe('dataUrlToBlob (profile pictures)', () => {
  const png = 'data:image/png;base64,' + btoa('fake image bytes');
  it('decodes a real image data URL locally', () => {
    const blob = dataUrlToBlob(png);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe('fake image bytes'.length);
  });
  it('refuses anything that is not an image data URL, so the server never fetches a web address (SSRF)', () => {
    for (const bad of ['https://example.com/x.png', 'http://169.254.169.254/latest/meta-data/', 'file:///etc/passwd', 'data:text/html;base64,PGI+', 'data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)', '', 'data:image/png;base64,@@@']) {
      expect(() => dataUrlToBlob(bad), bad).toThrow();
    }
  });
  it('refuses a picture over the size limit', () => {
    const big = 'data:image/webp;base64,' + btoa('a'.repeat(MAX_PICTURE_BYTES + 1));
    expect(() => dataUrlToBlob(big)).toThrow(/too large/);
  });
});
