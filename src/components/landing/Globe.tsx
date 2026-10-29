'use client';

import React, { useEffect, useRef } from 'react';
import createGlobe from 'cobe';
import { useResolvedTheme } from '@/lib/theme';

// The brand orange as 0-1 colour parts, for the globe's markers and arc.
const ORANGE: [number, number, number] = [0.918, 0.345, 0.047];

// Where DelCargo works: the New York hub, the transit centres across North America, and the teams in Pakistan.
// (Illustrative spots: change the list to match the real sites.)
type Spot = { name: string; location: [number, number] };
const HUB: Spot = { name: 'New York', location: [40.64, -73.78] };
const SPOTS: Spot[] = [
  { name: 'Chicago', location: [41.88, -87.63] },
  { name: 'Houston', location: [29.76, -95.37] },
  { name: 'Los Angeles', location: [34.05, -118.24] },
  { name: 'Karachi', location: [24.86, 67.01] },
  { name: 'Lahore', location: [31.52, 74.35] },
  { name: 'Islamabad', location: [33.68, 73.05] },
];
const MARKERS = [HUB, ...SPOTS].map(s => ({ location: s.location, size: s === HUB ? 0.08 : 0.06 }));
// One line from the hub to each place, drawn in turn: the lines build up one by one, then start over.
const ARCS = SPOTS.map(s => ({ from: HUB.location, to: s.location }));
const ARC_SECONDS = 1.1;

// A dotted globe turning slowly, white on a dark page and dark on a light one. It draws in WebGL on a canvas as wide as
// its box, and turns still (one frame) for people who ask their device for less motion.
export function Globe({ className = '' }: { className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dark = useResolvedTheme() === 'dark';

  useEffect(() => {
    const box = boxRef.current;
    if (!box || !box.clientWidth) return;
    // The canvas is made here, not by React: the globe library takes it over and may remove it when it is destroyed.
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block';
    box.replaceChildren(canvas); // nothing else in the box, whatever ran before
    const size = box.clientWidth;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let phi = 4.2; // starts turned toward the Atlantic, so New York is in view
    let frame = 0;
    let globe: ReturnType<typeof createGlobe> | null = null;
    try {
      globe = createGlobe(canvas, {
        width: size * 2,
        height: size * 2,
        devicePixelRatio: 2,
        phi,
        theta: 0.25,
        dark: dark ? 0 : 1,
        diffuse: 1.2,
        mapSamples: 16000,
        mapBrightness: 6,
        baseColor: dark ? [1, 1, 1] : [0.1, 0.1, 0.1],
        markerColor: ORANGE,
        glowColor: dark ? [1, 1, 1] : [0.85, 0.85, 0.85],
        markers: MARKERS,
        arcs: reduced ? ARCS : [],
        arcColor: ORANGE,
        arcWidth: 0.5,
        arcHeight: 0.3,
      });
    } catch {
      box.replaceChildren();
      return; // no WebGL here: the panel simply has no globe
    }
    if (!reduced) {
      const start = performance.now();
      let shown = -1;
      const turn = (now: number) => {
        phi += 0.004;
        // How many lines are drawn so far; one more every ARC_SECONDS, all held for a beat, then clear.
        const step = Math.floor((now - start) / 1000 / ARC_SECONDS) % (ARCS.length + 2);
        const count = Math.min(step, ARCS.length);
        if (count !== shown) { shown = count; globe?.update({ phi, arcs: ARCS.slice(0, count) }); }
        else globe?.update({ phi });
        frame = requestAnimationFrame(turn);
      };
      frame = requestAnimationFrame(turn);
    }
    return () => { cancelAnimationFrame(frame); globe?.destroy(); box.replaceChildren(); };
  }, [dark]);

  return <div ref={boxRef} aria-hidden="true" className={`aspect-square ${className}`} />;
}
