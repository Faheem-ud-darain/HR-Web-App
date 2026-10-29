import React from 'react';
import { FieldLabel } from './FieldLabel';

type FormFieldProps = {
  label: React.ReactNode;
  /** A smaller line under the control, for what to type or why it is asked. */
  hint?: React.ReactNode;
  // 'sm' = compact 10px label (modals/forms); 'md' = 12px label (settings pages).
  size?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
};

const WRAPPER = { sm: 'space-y-1.5', md: 'space-y-1' } as const;

// Label + control stack used by every form. Pair with Input / Select /
// Textarea from ./Input.
export function FormField({ label, hint, size = 'sm', className = '', children }: FormFieldProps) {
  return (
    <div className={`${WRAPPER[size]} ${className}`.trim()}>
      <FieldLabel size={size}>{label}</FieldLabel>
      {children}
      {hint && <p className="text-caption text-slate-500 font-semibold">{hint}</p>}
    </div>
  );
}
