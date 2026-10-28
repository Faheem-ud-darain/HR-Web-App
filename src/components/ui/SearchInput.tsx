'use client';

import React from 'react';
import { MagnifyingGlassIcon as Search, XIcon as X } from '@/components/ui/icons';
import { Input, type FieldSize } from './Input';

type SearchInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'onChange' | 'value' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
  fieldSize?: FieldSize;
  // Show an "x" that clears the box when there is text.
  clearable?: boolean;
  // Class for the outer wrapper (width, margins).
  wrapperClassName?: string;
};

// Search box with a leading magnifier — replaces ~7 hand-built
// relative-wrapper + icon + padded <input> combos. Takes the string value
// directly (onChange receives the text, not the event).
export function SearchInput({ value, onChange, fieldSize = 'md', clearable = false, wrapperClassName = '', className = '', placeholder = 'Search…', ...props }: SearchInputProps) {
  return (
    <div className={`relative ${wrapperClassName}`.trim()}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      <Input
        type="text"
        fieldSize={fieldSize}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        {...props}
        aria-label={props['aria-label'] ?? placeholder}
        className={className || undefined}
        // Inline so the icon gutter reliably beats the preset's horizontal padding.
        style={{ paddingLeft: '2.25rem', ...(clearable && value ? { paddingRight: '2rem' } : null), ...props.style }}
      />
      {clearable && value ? (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
