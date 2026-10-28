import React from 'react';
import { Card } from './Card';
import { IconChip, type ChipTone } from './IconChip';
import type { Icon } from '@phosphor-icons/react';

type Tone = 'default' | 'accent' | 'danger' | 'success' | 'warning';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const VALUE_TONE: Record<Tone, string> = {
  default: 'text-slate-900',
  accent: 'text-orange-600', // brand secondary colour
  danger: 'text-rose-600',
  success: 'text-emerald-700',
  warning: 'text-amber-700',
};
const VALUE_SIZE: Record<Size, string> = {
  sm: 'text-sm',
  md: 'text-xl md:text-2xl',
  lg: 'text-2xl',
  xl: 'text-2xl md:text-3xl',
};

type StatCardProps = {
  label: React.ReactNode;
  // Small live marker or hint after the label, e.g. a pulsing dot.
  labelExtra?: React.ReactNode;
  // Small leading glyph in the label row, e.g. <Users className="h-3.5 w-3.5" />.
  icon?: React.ReactNode;
  // The coloured tile with a filled icon, top right.
  chip?: { icon: Icon; tone: ChipTone };
  value?: React.ReactNode;
  valueTone?: Tone;
  size?: Size;
  // Muted caption under the value (and under `children`).
  sub?: React.ReactNode;
  // Makes the whole card a button.
  onClick?: () => void;
  className?: string;
  // Extra body under the value, e.g. a sparkline.
  children?: React.ReactNode;
};

// The one KPI tile for every dashboard and report: label and icon tile in a row on top, the value on its own line
// below (so a long number never fights the tile for width on a phone), then an optional chart and caption.
export function StatCard({ label, labelExtra, icon, chip, value, valueTone = 'default', size = 'lg', sub, onClick, className, children }: StatCardProps) {
  return (
    <Card onClick={onClick} className={`p-4 md:p-5 ${className ?? ''}`.trim()}>
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 min-w-0 text-xs font-semibold text-slate-500 leading-snug">
          {icon ? <span className="text-slate-500 inline-flex shrink-0">{icon}</span> : null}
          {label}
          {labelExtra}
        </p>
        {chip ? <IconChip icon={chip.icon} tone={chip.tone} /> : null}
      </div>
      {value !== undefined && <p className={`${VALUE_SIZE[size]} font-bold ${VALUE_TONE[valueTone]} mt-1`}>{value}</p>}
      {children}
      {sub ? <p className="text-caption text-slate-500 font-semibold mt-0.5">{sub}</p> : null}
    </Card>
  );
}
