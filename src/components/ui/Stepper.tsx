import React from 'react';
import { CheckIcon as Check } from '@/components/ui/icons';

// The progress strip of a multi-step flow: a numbered dot per step (a tick once done, ringed while current) joined by a
// line, each with its name underneath. `current` counts from 1.
export function Stepper({ steps, current, label = 'Progress' }: { steps: readonly string[]; current: number; label?: string }) {
  return (
    <ol aria-label={label} className="flex items-start">
      {steps.map((name, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={name} aria-current={active ? 'step' : undefined} className={`relative flex-1 flex flex-col items-center gap-1.5 ${i === 0 ? '' : "before:content-[''] before:absolute before:top-4 before:right-1/2 before:left-[-50%] before:h-0.5 before:-translate-y-1/2"} ${done || active ? 'before:bg-orange-600' : 'before:bg-slate-200'}`}>
            <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
              done ? 'bg-orange-600 text-white' : active ? 'bg-orange-600 text-white ring-4 ring-orange-100' : 'bg-slate-100 text-slate-400'
            }`}>
              {done ? <Check weight="bold" className="h-4 w-4" aria-hidden="true" /> : n}
            </span>
            <span className={`text-caption text-center leading-tight ${active ? 'font-bold text-slate-900' : 'font-semibold text-slate-400'} ${active ? '' : 'max-sm:hidden'}`}>{name}</span>
          </li>
        );
      })}
    </ol>
  );
}
