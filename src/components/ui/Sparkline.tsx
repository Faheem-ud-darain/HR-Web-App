'use client';

import React, { useId, useState } from 'react';
import { smoothAreaPath, smoothLinePath } from '@/lib/sparkline';

interface SparklineProps {
  values: number[];
  // Text shown in the hover/tap tooltip for point `i`: the small grey day name, then the detail.
  label: (i: number) => string;
  detail: (i: number) => React.ReactNode;
  // A Tailwind text colour, e.g. "text-orange-500". The line, fill and dots all draw in it (currentColor),
  // so colours stay in the theme instead of being typed as hex in each chart.
  colorClass: string;
}

const W = 132;
const H = 40;
const TOP_PAD = 6;

// The small trend line on the dashboard stat cards: a smooth curve with a soft fill, a dot on the latest
// value, and a tooltip on hover or tap. Hand-built SVG, so there is no chart library to ship.
export function Sparkline({ values: rawValues, label, detail, colorClass }: SparklineProps) {
  // One value is drawn as a flat line (two equal points) so the x spacing stays finite; no values draw nothing.
  const values = rawValues.length === 1 ? [rawValues[0], rawValues[0]] : rawValues;
  const gradientId = `spark-${useId().replace(/:/g, '')}`;
  const [hovered, setHovered] = useState<number | null>(null);

  const max = Math.max(1, ...values);
  const gap = W / (values.length - 1);
  const points = values.map((v, i) => ({ x: i * gap, y: TOP_PAD + (1 - v / max) * (H - TOP_PAD) }));
  const today = points[points.length - 1];
  if (!today) return null;

  return (
    <div className={`relative mt-2 ${colorClass}`}>
      <svg viewBox={`0 0 ${W} ${H + 2}`} className="w-full h-10" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.28} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={smoothAreaPath(points, H)} fill={`url(#${gradientId})`} className="chart-area-fill" />
        <path
          d={smoothLinePath(points)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          className="chart-line-draw"
        />
        <circle cx={today.x} cy={today.y} r={2.75} fill="currentColor" stroke="var(--color-white)" strokeWidth={1.25} className="chart-dot-today" />
        {hovered !== null && hovered !== points.length - 1 && (
          <circle cx={points[hovered].x} cy={points[hovered].y} r={2.75} fill="currentColor" stroke="var(--color-white)" strokeWidth={1.25} className="chart-hover-dot" />
        )}
        {/* Invisible, generously sized hit targets: the visible dots are too small to hover or tap reliably.
            Pointer events cover mouse and touch; the click toggles (tap the same point again to dismiss) and
            stops propagation so it does not also open the card's own popup. */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={9}
            fill="transparent"
            onPointerEnter={() => setHovered(i)}
            onPointerLeave={() => setHovered(prev => (prev === i ? null : prev))}
            onClick={e => { e.stopPropagation(); setHovered(prev => (prev === i ? null : i)); }}
            style={{ cursor: 'pointer' }}
          />
        ))}
      </svg>
      {hovered !== null && (
        <div className="absolute z-10 pointer-events-none chart-tooltip-in" style={{ left: `${(points[hovered].x / W) * 100}%`, top: '50%' }}>
          <div className="bg-slate-900 text-white text-caption font-bold px-2 py-1 rounded-md shadow-lg whitespace-nowrap">
            <span className="text-slate-300 font-semibold mr-1">{label(hovered)}</span>
            {detail(hovered)}
          </div>
        </div>
      )}
    </div>
  );
}
