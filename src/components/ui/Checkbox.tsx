import React from 'react';

// A checkbox with its label: the whole row is the tap target, and the box is orange when ticked like the app's switches.
// `children` is the label; `hint` is the smaller line under it.
export function Checkbox({ checked, onChange, children, hint, disabled, className = '' }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={`flex items-start gap-3 min-h-11 ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-slate-300 accent-orange-600 focus-visible:ring-2 focus-visible:ring-orange-500"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{children}</span>
        {hint && <span className="block text-xs text-slate-500 font-medium mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}
