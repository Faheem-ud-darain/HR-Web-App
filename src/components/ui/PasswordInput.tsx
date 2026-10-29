'use client';

import React, { useState } from 'react';
import { FIELD_STYLES } from '@/components/ui/Input';
import { EyeIcon as Eye, EyeSlashIcon as EyeOff } from '@/components/ui/icons';

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

// Reusable password input with a show/hide toggle. Used anywhere a password
// field is masked by default, so users can verify what they typed.
export function PasswordInput({ value, onChange, placeholder, className, required }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className={`${className || FIELD_STYLES.md} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
