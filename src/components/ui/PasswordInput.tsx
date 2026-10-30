'use client';

import React, { useState } from 'react';
import { Input, type FieldSize } from '@/components/ui/Input';
import { EyeIcon as Eye, EyeSlashIcon as EyeOff } from '@/components/ui/icons';

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { fieldSize?: FieldSize };

// The one password field: masked, with an eye button to show what was typed. Every secret the app asks for (sign-in, a new
// password, a password HR sets) uses it, so each has the toggle and gets the same look. It takes every Input prop; set
// autoComplete ("current-password" / "new-password") so the browser or phone can offer to save and fill the password.
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput({ className = '', ...props }, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={visible ? 'text' : 'password'} className={`pr-10 ${className}`} {...props} />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});
