import React from 'react';

type FormFieldProps = {
  label: React.ReactNode;
  // 'sm' = compact 10px label (modals/forms); 'md' = 12px label (settings pages).
  size?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
};

const WRAPPER = { sm: 'space-y-1.5', md: 'space-y-1' } as const;
const LABEL = {
  sm: 'text-[10px] font-bold text-slate-500 uppercase tracking-wider',
  md: 'text-xs font-bold text-slate-600 uppercase tracking-wider',
} as const;

// Label + control stack used by every form. Pair with Input / Select /
// Textarea from ./Input.
export function FormField({ label, size = 'sm', className = '', children }: FormFieldProps) {
  return (
    <div className={`${WRAPPER[size]} ${className}`.trim()}>
      <label className={LABEL[size]}>{label}</label>
      {children}
    </div>
  );
}
