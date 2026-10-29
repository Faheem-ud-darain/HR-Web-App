import React from 'react';

// Thin curves across a panel, drawn in the page's ink colour so they follow light and dark: two sheets crossing one way
// and the other, each drifting slowly as a whole. The curves are drawn once and only the sheet moves, which costs the
// browser almost nothing (per-curve animation, tried first, stalled painting). Still for reduced motion.
const COUNT = 28;

function Sheet({ position, className }: { position: 1 | -1; className: string }) {
  return (
    <svg className={`absolute -inset-[8%] h-[116%] w-[116%] text-ink ${className}`} viewBox="0 0 696 316" fill="none" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {Array.from({ length: COUNT }, (_, i) => (
        <path
          key={i}
          d={`M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`}
          stroke="currentColor"
          strokeWidth={0.5 + i * 0.03}
          strokeOpacity={0.05 + i * 0.012}
        />
      ))}
    </svg>
  );
}

export function FloatingPaths() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <Sheet position={1} className="paths-drift-a" />
      <Sheet position={-1} className="paths-drift-b" />
    </div>
  );
}
