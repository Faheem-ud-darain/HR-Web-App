'use client';

import React from 'react';

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  // Accessible name — required because a switch has no visible text of its own.
  label: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
};

const TRACK = { sm: 'h-5 w-9', md: 'h-6 w-11' } as const;
const THUMB = { sm: 'h-4 w-4', md: 'h-5 w-5' } as const;
const SHIFT = { sm: 'translate-x-4', md: 'translate-x-5' } as const;

// Toggle switch (role="switch"). On = orange, off = grey.
export function Switch({ checked, onChange, label, size = 'md', disabled, className = '' }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 inline-flex items-center rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${TRACK[size]} ${checked ? 'bg-orange-600' : 'bg-slate-300'} ${className}`}
    >
      <span className={`absolute top-0.5 left-0.5 ${THUMB[size]} rounded-full bg-white shadow transition-transform duration-150 ${checked ? SHIFT[size] : 'translate-x-0'}`} />
    </button>
  );
}
