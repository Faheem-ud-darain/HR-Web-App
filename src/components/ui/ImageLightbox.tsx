'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Download } from 'lucide-react';
import { pushModal, popModal } from '@/lib/modalStack';
import { useIsClient } from '@/lib/useIsClient';

interface ImageLightboxProps {
  src: string | null;
  alt?: string;
  downloadName?: string;
  onClose: () => void;
}

// Full-size image viewer used for profile pictures (HR/Admin "view full
// size" on an employee's photo) and for ticket attachment images.
//
// Ticket attachment images used to open via <a target="_blank"> pointing at
// a base64 data: URL — that's a known Capacitor/Android WebView gotcha:
// target="_blank" on a data: URL tries to hand off to an external browser
// intent, which either fails silently or opens a blank tab, since the data
// isn't a real navigable document. Rendering the image in an in-app overlay
// instead (like this) sidesteps that entirely — no navigation, so nothing to
// break, on any platform.
export function ImageLightbox({ src, alt, downloadName, onClose }: ImageLightboxProps) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [src, onClose]);

  // Registers with the shared modal-stack tracker — see lib/modalStack.ts.
  useEffect(() => {
    if (src) {
      pushModal();
      return () => popModal();
    }
  }, [src]);

  // Mounted-check for the SSR/hydration-safe createPortal pattern (matches
  // Modal.tsx).
  const mounted = useIsClient();

  if (!src || !mounted || typeof document === 'undefined') return null;

  // Portaled straight to document.body (like Modal.tsx) rather than rendered
  // inline where it's used (TicketsView, UserProfileModal, etc.) — this used
  // to be a plain nested element, which meant its `fixed inset-0` could get
  // trapped inside an ancestor that had (even accidentally) become a
  // containing block, e.g. the dashboard page-content wrapper's page-enter
  // animation leaving a stuck `transform` behind. That's what was pushing
  // the image toward the top of the screen instead of centering it, and
  // pushing the close/download buttons outside the dark backdrop's clipped
  // area entirely — landing them on the plain white page background, where
  // white-on-white made them invisible. Portaling to document.body sidesteps
  // that class of bug entirely, regardless of what any ancestor does.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 fade-enter"
      onClick={onClose}
    >
      {/* z-10 + a darker blurred pill (instead of the too-transparent
          bg-white/10) — this used to sit before the <img> in markup with no
          explicit z-index, so on wide images the image itself (rendered
          after, so on top by default stacking order) could cover these
          buttons; and bg-white/10 alone all but disappears over a
          light/white-background image. Both fixed here so download/close
          stay visible and tappable no matter what the image looks like. */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2" onClick={e => e.stopPropagation()}>
        <a
          href={src}
          download={downloadName || 'image'}
          className="h-9 w-9 rounded-full bg-black/40 backdrop-blur-md hover:bg-black/55 text-white flex items-center justify-center transition-colors"
          title="Download"
        >
          <Download className="h-4 w-4" />
        </a>
        <button
          onClick={onClose}
          className="h-9 w-9 rounded-full bg-black/40 backdrop-blur-md hover:bg-black/55 text-white flex items-center justify-center transition-colors"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <img
        src={src}
        alt={alt || 'Image'}
        className="relative z-0 max-h-[90vh] max-w-[95vw] object-contain rounded-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}
