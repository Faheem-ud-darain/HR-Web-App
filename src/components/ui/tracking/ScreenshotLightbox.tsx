'use client';

import React, { useEffect, useState } from 'react';
import { CaretLeftIcon as ChevronLeft, CaretRightIcon as ChevronRight, ArrowCounterClockwiseIcon as RotateCcw, MagnifyingGlassPlusIcon as ZoomIn, MagnifyingGlassMinusIcon as ZoomOut } from '@/components/ui/icons';
import type { Screenshot } from '@/lib/hrData';
import { formatDateTimeNY } from '@/lib/timezone';
import { ViewerButton, ViewerOverlay } from '@/components/ui/ViewerOverlay';

interface ScreenshotLightboxProps {
  shots: Screenshot[];
  index: number;
  // How many screenshots exist in the whole window (only some pages may be loaded).
  total: number;
  onClose: () => void;
  // Step to the previous (-1) or next (+1) screenshot.
  onNav: (delta: number) => void;
}

// Full-size screenshot with zoom, opened from a thumbnail on top of the Screenshots dialog. ViewerOverlay is the shell
// (Escape, focus, modal stack); this adds the zoom controls and the arrow keys that move between shots. Mount it only
// while open.
export function ScreenshotLightbox({ shots, index, total, onClose, onNav }: ScreenshotLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const zoomIn = () => setZoom(z => Math.min(4, Math.round((z + 0.5) * 10) / 10));
  const zoomOut = () => setZoom(z => Math.max(1, Math.round((z - 0.5) * 10) / 10));
  const go = (delta: number) => { setZoom(1); onNav(delta); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-bound when the shot or the loaded count changes so navigation sees current values
  }, [index, shots.length]);

  const shot = shots[index];
  if (!shot) return null;

  return (
    <ViewerOverlay
      label="Screenshot"
      onClose={onClose}
      title={`${formatDateTimeNY(shot.timestamp)} · ${index + 1} / ${total}`}
      actions={
        <>
          <ViewerButton label="Zoom out" onClick={zoomOut} disabled={zoom <= 1}><ZoomOut className="h-4 w-4" aria-hidden="true" /></ViewerButton>
          <span className="w-10 text-center text-caption font-bold text-white">{Math.round(zoom * 100)}%</span>
          <ViewerButton label="Zoom in" onClick={zoomIn} disabled={zoom >= 4}><ZoomIn className="h-4 w-4" aria-hidden="true" /></ViewerButton>
          <ViewerButton label="Reset zoom" onClick={() => setZoom(1)}><RotateCcw className="h-4 w-4" aria-hidden="true" /></ViewerButton>
        </>
      }
    >
      {/* The arrows are round dark pills so they stay visible over white screenshots. */}
      {index > 0 && <ViewerButton label="Previous screenshot" onClick={() => go(-1)} className="absolute left-3 top-1/2 z-10 -translate-y-1/2"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></ViewerButton>}
      <img
        src={shot.imageUrl}
        alt="Screenshot full view"
        style={{ transform: `scale(${zoom})`, transition: 'transform 0.15s ease-out' }}
        className="max-h-full max-w-full select-none object-contain"
        onWheel={e => { e.preventDefault(); if (e.deltaY < 0) zoomIn(); else zoomOut(); }}
      />
      {(index < shots.length - 1 || total > shots.length) && ( // more pages remain: Next loads them
        <ViewerButton label="Next screenshot" onClick={() => go(1)} className="absolute right-3 top-1/2 z-10 -translate-y-1/2"><ChevronRight className="h-5 w-5" aria-hidden="true" /></ViewerButton>
      )}
    </ViewerOverlay>
  );
}
