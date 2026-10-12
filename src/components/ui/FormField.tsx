import React from 'react';
import { FieldLabel } from './FieldLabel';

type FormFieldProps = {
  label: React.ReactNode;
  // 'sm' = compact 10px label (modals/forms); 'md' = 12px label (settings pages).
  size?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
};

const WRAPPER = { sm: 'space-y-1.5', md: 'space-y-1' } as const;

// Label + control stack used by every form. Pair with Input / Select /
// Textarea from ./Input.
export function FormField({ label, size = 'sm', className = '', children }: FormFieldProps) {
  return (
    <div className={`${WRAPPER[size]} ${className}`.trim()}>
      <FieldLabel size={size}>{label}</FieldLabel>
      {children}
    </div>
  );
}
