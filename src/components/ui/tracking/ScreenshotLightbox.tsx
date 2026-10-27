'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { Screenshot } from '@/lib/hrData';
import { formatDateTimeNY } from '@/lib/timezone';
import { popModal, pushModal } from '@/lib/modalStack';
import { useIsClient } from '@/lib/useIsClient';

interface ScreenshotLightboxProps {
  shots: Screenshot[];
  index: number;
  // How many screenshots exist in the whole window (only some pages may be loaded).
  total: number;
  onClose: () => void;
  // Step to the previous (-1) or next (+1) screenshot.
  onNav: (delta: number) => void;
}

const BUTTON = 'p-2 rounded-lg bg-black/40 backdrop-blur-md hover:bg-black/55 transition-colors';

// Full-size screenshot with zoom, opened from a thumbnail. A fixed overlay portaled to <body> (not the shared
// Modal), because it has to sit on top of the Screenshots dialog itself and carry its own zoom controls. Mounted
// only while open: it registers with the modal stack so the mobile bottom nav hides, and handles the keyboard
// (Escape closes, arrows move between shots).
export function ScreenshotLightbox({ shots, index, total, onClose, onNav }: ScreenshotLightboxProps) {
  const mounted = useIsClient();
  const [zoom, setZoom] = useState(1);
  const zoomIn = () => setZoom(z => Math.min(4, Math.round((z + 0.5) * 10) / 10));
  const zoomOut = () => setZoom(z => Math.max(1, Math.round((z - 0.5) * 10) / 10));
  const go = (delta: number) => { setZoom(1); onNav(delta); };

  useEffect(() => {
    pushModal();
    return () => popModal();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); } // captured first, so the dialog behind does not also close
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-bound when the shot or the loaded count changes so navigation sees current values
  }, [index, shots.length]);

  const shot = shots[index];
  if (!mounted || !shot) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-slate-950/90 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-white" onClick={e => e.stopPropagation()}>
        <span className="text-xs font-semibold text-slate-200">{formatDateTimeNY(shot.timestamp)} · {index + 1} / {total}</span>
        <div className="flex items-center gap-1.5">
          <button onClick={zoomOut} disabled={zoom <= 1} aria-label="Zoom out" className={`${BUTTON} disabled:opacity-40`}><ZoomOut className="h-4 w-4" /></button>
          <span className="text-[10px] font-bold w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={zoomIn} disabled={zoom >= 4} aria-label="Zoom in" className={`${BUTTON} disabled:opacity-40`}><ZoomIn className="h-4 w-4" /></button>
          <button onClick={() => setZoom(1)} title="Reset zoom" aria-label="Reset zoom" className={BUTTON}><RotateCcw className="h-4 w-4" /></button>
          <button onClick={onClose} aria-label="Close" className={`${BUTTON} ml-1`}><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center overflow-auto relative" onClick={e => e.stopPropagation()}>
        {/* z-10 on both arrows: without an explicit stacking order the image painted over whichever arrow came
            before it in the markup. A dark blurred pill keeps them visible over white screenshots too. */}
        {index > 0 && (
          <button onClick={() => go(-1)} aria-label="Previous screenshot" className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/40 backdrop-blur-md hover:bg-black/55 text-white transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <img
          src={shot.imageUrl}
          alt="Screenshot full view"
          style={{ transform: `scale(${zoom})`, transition: 'transform 0.15s ease-out' }}
          className="max-h-[80vh] max-w-[90vw] object-contain select-none"
          onWheel={e => { e.preventDefault(); if (e.deltaY < 0) zoomIn(); else zoomOut(); }}
        />
        {index < shots.length - 1 && (
          <button onClick={() => go(1)} aria-label="Next screenshot" className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/40 backdrop-blur-md hover:bg-black/55 text-white transition-colors">
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
