'use client';

import React, { useCallback, useRef } from 'react';
import { CalendarBlankIcon as Calendar } from '@/components/ui/icons';
import { Input } from '@/components/ui/Input';

// Date fields with a calendar button: the person can type the date or tap the icon and pick it. One look and one behaviour for every date in the app.

/** Opens the browser's own date picker; a browser without showPicker just puts the cursor in the field. */
function openPicker(el: HTMLInputElement | null) {
  if (!el) return;
  try { el.showPicker(); } catch { el.focus(); }
}

const BUTTON = 'absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-orange-600 focus-visible:outline-2 focus-visible:outline-orange-500';
// Our button replaces the browser's own little calendar so there is only one.
const NO_NATIVE_ICON = 'pr-9 [&::-webkit-calendar-picker-indicator]:hidden';

type DateInputProps = Omit<React.ComponentProps<typeof Input>, 'type'> & { wrapperClassName?: string };

/** A date field (value "YYYY-MM-DD"): type it or pick it. Takes the same props as Input, minus `type`. */
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(function DateInput({ className, wrapperClassName, ...props }, ref) {
  const inner = useRef<HTMLInputElement | null>(null);
  const setRefs = useCallback((el: HTMLInputElement | null) => {
    inner.current = el;
    if (typeof ref === 'function') ref(el); else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
  }, [ref]);
  return (
    <div className={`relative ${wrapperClassName ?? ''}`}>
      <Input ref={setRefs} type="date" className={`${NO_NATIVE_ICON} ${className ?? ''}`} {...props} />
      {!props.disabled && !props.readOnly && (
        <button type="button" aria-label="Pick a date" onClick={() => openPicker(inner.current)} className={BUTTON}>
          <Calendar className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
});

type DateSearchInputProps = Omit<React.ComponentProps<typeof Input>, 'type' | 'value' | 'onChange'> & { value: string; onChange: (value: string) => void; wrapperClassName?: string };

/** A filter box for dates: type a date or a word like "today" or "tomorrow", or tap the icon and pick a day (it is written into the box as "YYYY-MM-DD"). */
export function DateSearchInput({ value, onChange, className, wrapperClassName, ...props }: DateSearchInputProps) {
  const picker = useRef<HTMLInputElement | null>(null);
  return (
    <div className={`relative ${wrapperClassName ?? ''}`}>
      <Input type="text" value={value} onChange={e => onChange(e.target.value)} className={`pr-9 ${className ?? ''}`} {...props} />
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1/2 h-0 w-0 opacity-0"
        onChange={e => { if (e.target.value) onChange(e.target.value); }}
      />
      <button type="button" aria-label="Pick a date" onClick={() => openPicker(picker.current)} className={BUTTON}>
        <Calendar className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
