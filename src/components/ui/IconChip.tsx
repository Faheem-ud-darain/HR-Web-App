import React from 'react';
import type { Icon } from '@phosphor-icons/react';

type Tone = 'indigo' | 'emerald' | 'amber' | 'orange' | 'sky';
type Size = 'md' | 'sm';

const TONE: Record<Tone, string> = {
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  orange: 'bg-orange-50 text-orange-600',
  sky: 'bg-sky-50 text-sky-600',
};
const SIZE: Record<Size, string> = {
  md: 'h-10 w-10 md:h-11 md:w-11 rounded-xl',
  sm: 'h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl',
};

// The rounded coloured tile with a filled icon in it, on the right of a dashboard card.
export function IconChip({ icon: Glyph, tone, size = 'md' }: { icon: Icon; tone: Tone; size?: Size }) {
  return (
    <div className={`${SIZE[size]} ${TONE[tone]} shrink-0 flex items-center justify-center`}>
      <Glyph weight="fill" className="h-4 w-4 md:h-5 md:w-5" aria-hidden="true" />
    </div>
  );
}
