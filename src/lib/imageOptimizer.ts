/**
 * Utilities for client-side image optimization and WebP conversion.
 *
 * This file used to also export its own `compressImageToWebP` — a second,
 * completely different function with the same name as the one in
 * `imageCompressor.ts` (different signature, returned a Blob instead of a
 * base64 string, no HEIC/decode-failure handling). It was never actually
 * imported anywhere (every real upload path uses imageCompressor.ts's
 * version), so it was dead code — but a duplicate export with an
 * incompatible signature is exactly the kind of landmine that causes a
 * future edit or import to silently pick up the wrong, unmaintained
 * implementation. Removed rather than kept "just in case".
 */

/**
 * Generate a tiny blurred base64 SVG data URI to use as a smooth loading placeholder.
 */
export function getBlurPlaceholderSvg(width = 40, height = 40): string {
  // Fixed a duplicate `id="b"` attribute on the <filter> element (invalid
  // SVG markup — harmless in practice since browsers just use the first
  // occurrence, but worth cleaning up while touching this file).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
    <filter id="b" filterUnits="userSpaceOnUse">
      <feGaussianBlur stdDeviation="12" />
    </filter>
    <rect width="100%" height="100%" fill="#cbd5e1" filter="url(#b)" />
  </svg>`;
  return `data:image/svg+xml;base64,${typeof window !== 'undefined' ? btoa(svg) : Buffer.from(svg).toString('base64')}`;
}
