'use client';

import React from 'react';
import type { IconWeight } from '@phosphor-icons/react';

// One tab/filter control with three looks. Controlled and generic over the
// tab value; renders proper tablist semantics.
//   underline — page-level tabs (orange underline on the active tab)
//   segmented — compact switcher in a grey tray (white active pill)
//   chips     — filter pills; active chip is solid orange (or `tone`)
//   pills     — outlined uppercase pills for the public pages (brand fill when active, ink outline otherwise)
export type TabTone = 'default' | 'warning' | 'danger' | 'success' | 'indigo';

export type TabItem<T extends string> = {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  // Small trailing number, e.g. a pending count. `badge` renders as a pill.
  count?: number;
  badge?: number;
  tone?: TabTone; // chips only
};

type TabsProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  items: TabItem<T>[];
  variant?: 'underline' | 'segmented' | 'chips' | 'pills';
  // Stretch to the full width, each tab taking an equal share.
  fill?: boolean;
  // Tighter padding, for tabs that sit in a toolbar or a side panel.
  compact?: boolean;
  'aria-label'?: string;
  className?: string;
  // Gives each tab the id `${idPrefix}-${value}` (so a panel can name it with aria-labelledby) and points it at `panelId`.
  idPrefix?: string;
  panelId?: string;
};

const CHIP_ACTIVE: Record<TabTone, string> = {
  default: 'bg-orange-600 text-white',
  warning: 'bg-amber-500 text-white',
  danger: 'bg-rose-600 text-white',
  success: 'bg-emerald-600 text-white',
  indigo: 'bg-indigo-600 text-white',
};
const CHIP_IDLE: Record<TabTone, string> = {
  default: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100',
  danger: 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100',
  indigo: 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100',
};

export function Tabs<T extends string>({ value, onChange, items, variant = 'underline', fill = false, compact = false, className = '', idPrefix, panelId, ...rest }: TabsProps<T>) {
  const container = {
    underline: 'flex gap-2 border-b border-slate-200 overflow-x-auto scrollbar-hide',
    segmented: `flex bg-slate-100 ${compact ? 'p-0.5 rounded-lg' : 'p-1 rounded-xl'} ${fill ? 'w-full' : 'w-fit'} border border-slate-200`,
    chips: 'flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide',
    pills: 'flex gap-2 overflow-x-auto no-scrollbar',
  }[variant];

  // Arrow keys, Home and End move between the tabs (roving focus), as in the ARIA tabs pattern.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = items.findIndex(t => t.value === value);
    const to = e.key === 'ArrowRight' ? (i + 1) % items.length : e.key === 'ArrowLeft' ? (i - 1 + items.length) % items.length : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(items[to].value);
    (e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[to])?.focus();
  };

  return (
    <div role="tablist" aria-label={rest['aria-label']} className={`${container} ${className}`.trim()} onKeyDown={onKeyDown}>
      {items.map(item => {
        const active = item.value === value;
        const tone = item.tone ?? 'default';
        const style = {
          underline: `flex items-center gap-1.5 shrink-0 whitespace-nowrap px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${active ? 'border-orange-500 text-orange-700 bg-orange-50' : 'border-transparent text-slate-500 hover:text-slate-800'}`,
          segmented: `${compact ? 'px-2.5 py-1' : 'px-4 py-2'} rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 ${fill ? 'flex-1' : ''} ${active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`,
          pills: `shrink-0 rounded-full px-4 min-h-9 text-xs font-bold uppercase tracking-wider border transition-colors ${active ? 'bg-brand border-transparent text-black' : 'border-ink/15 text-ink/70 hover:text-ink hover:border-ink/40'}`,
          chips: `${compact ? 'px-3 py-1 rounded-full' : 'px-3.5 py-2 rounded-xl'} text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap ${active ? CHIP_ACTIVE[tone] : CHIP_IDLE[tone]}`,
        }[variant];
        return (
          <button key={item.value} type="button" role="tab" id={idPrefix ? `${idPrefix}-${item.value}` : undefined} aria-controls={panelId} aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => onChange(item.value)} className={style}>
            {/* The selected tab's icon is filled, the others are outlines. */}
            {React.isValidElement(item.icon) ? React.cloneElement(item.icon as React.ReactElement<{ weight?: IconWeight }>, { weight: active ? 'fill' : 'regular' }) : item.icon}
            {item.label}
            {item.count !== undefined && <span>({item.count})</span>}
            {item.badge ? <span className="bg-amber-500 text-white text-caption font-bold px-1.5 py-0.5 rounded-full">{item.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
