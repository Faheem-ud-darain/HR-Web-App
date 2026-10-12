import React from 'react';

// The small label above a form control. Variants replace the half-dozen
// hand-typed label class strings the app had drifted into.
//   sm    — 10px uppercase, slate-500 (default; modals & forms)
//   md    — 12px uppercase, slate-600 (settings pages)
//   muted — 10px uppercase, slate-400 (secondary/optional fields)
//   tiny  — 9px uppercase, slate-400 (dense panels)
//   plain — 12px sentence-case, slate-700, block with bottom margin
export type FieldLabelSize = 'sm' | 'md' | 'muted' | 'tiny' | 'plain';

export const FIELD_LABEL_STYLES: Record<FieldLabelSize, string> = {
  sm: 'text-[10px] font-bold text-slate-500 uppercase tracking-wider',
  md: 'text-xs font-bold text-slate-600 uppercase tracking-wider',
  muted: 'text-[10px] font-bold text-slate-400 uppercase tracking-wider',
  tiny: 'text-[9px] font-bold text-slate-400 uppercase tracking-wider',
  plain: 'text-xs font-bold text-slate-700 mb-1 block',
};

type FieldLabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & { size?: FieldLabelSize };

export function FieldLabel({ size = 'sm', className, ...props }: FieldLabelProps) {
  return <label className={className ? `${FIELD_LABEL_STYLES[size]} ${className}` : FIELD_LABEL_STYLES[size]} {...props} />;
}
