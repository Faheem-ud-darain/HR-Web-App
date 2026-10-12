import React from 'react';
import { Card } from './Card';

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
  xl: 'text-3xl',
};

type StatCardProps = {
  label: React.ReactNode;
  // Small leading glyph in the label row, e.g. <Users className="h-3.5 w-3.5" />.
  icon?: React.ReactNode;
  value?: React.ReactNode;
  valueTone?: Tone;
  size?: Size;
  // Muted caption under the value.
  sub?: React.ReactNode;
  // Rounded icon chip pinned to the right (e.g. dollar sign on a payroll tile).
  trailing?: React.ReactNode;
  className?: string;
  // Escape hatch for tiles that need a custom body instead of `value`.
  children?: React.ReactNode;
};

// KPI tile: small uppercase label, big value, optional caption. Replaces the
// hand-built Card > CardContent > <p>label</p><p>value</p> blocks.
export function StatCard({ label, icon, value, valueTone = 'default', size = 'lg', sub, trailing, className, children }: StatCardProps) {
  const body = (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
        {icon ? <span className="text-slate-400 inline-flex shrink-0">{icon}</span> : null}
        {label}
      </p>
      {value !== undefined && (
        <p className={`${VALUE_SIZE[size]} font-bold ${VALUE_TONE[valueTone]} mt-1`}>{value}</p>
      )}
      {children}
      {sub ? <p className="text-[10px] text-slate-500 font-semibold mt-0.5">{sub}</p> : null}
    </div>
  );
  return (
    <Card className={`p-5 ${className ?? ''}`.trim()}>
      {trailing ? (
        <div className="flex items-center justify-between gap-3">
          {body}
          <div className="h-11 w-11 shrink-0 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">{trailing}</div>
        </div>
      ) : body}
    </Card>
  );
}
