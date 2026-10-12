import React from 'react';

// Shared text-field styling. Forms used to hand-type ~70 slightly different
// Tailwind strings; these presets are the ones that were already in use most
// (exact class strings, so converting a call site changes nothing visually).
//   md   — default dialog/form field (rounded-lg, text-sm)
//   sm   — compact (rounded-xl, text-xs, semibold)
//   lg   — roomy (rounded-xl, py-2.5, text-xs, semibold)
//   soft — roomy with hover/focus ring (newer onboarding/profile style)
//   pill — rounded-full grey search field (top bar)
export type FieldSize = 'md' | 'sm' | 'lg' | 'soft' | 'pill';

export const FIELD_STYLES: Record<FieldSize, string> = {
  md: 'w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:border-orange-500 outline-none text-slate-900',
  sm: 'w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs outline-none focus:border-orange-500 font-semibold',
  lg: 'w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs outline-none focus:border-orange-500 font-semibold',
  pill: 'w-full bg-slate-100/80 border border-transparent rounded-full py-1.5 pr-4 text-sm focus:border-orange-500 focus:bg-white outline-none text-slate-900 transition-colors font-semibold',
  soft: 'w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-orange-100 font-semibold',
};

const join = (size: FieldSize, className?: string) => (className ? `${FIELD_STYLES[size]} ${className}` : FIELD_STYLES[size]);

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { fieldSize?: FieldSize };
export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input({ fieldSize = 'md', className, ...props }, ref) {
  return <input ref={ref} className={join(fieldSize, className)} {...props} />;
});

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { fieldSize?: FieldSize };
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select({ fieldSize = 'md', className, ...props }, ref) {
  return <select ref={ref} className={join(fieldSize, className)} {...props} />;
});

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { fieldSize?: FieldSize };
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ fieldSize = 'md', className, ...props }, ref) {
  return <textarea ref={ref} className={join(fieldSize, className)} {...props} />;
});
