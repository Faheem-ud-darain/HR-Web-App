import React from 'react';

type EmptyStateProps = {
  children: React.ReactNode;
  // Vertical padding step — the app used 6/8/10/12 interchangeably.
  py?: 6 | 8 | 10 | 12;
  size?: 'xs' | 'sm' | 'base';
  // Render as a table cell (pass colSpan) when the message sits inside a <tr>.
  as?: 'p' | 'div' | 'td';
  colSpan?: number;
  className?: string;
  // A dashed box around the message, for a panel that is empty as a whole.
  bordered?: boolean;
  // What to do about it, shown under the message (a button that fixes the emptiness).
  action?: React.ReactNode;
};

const PY = { 6: 'py-6', 8: 'py-8', 10: 'py-10', 12: 'py-12' } as const;
const SIZE = { xs: 'text-xs', sm: 'text-sm', base: '' } as const;

// "Nothing here yet" message for lists, tables and panels — one look instead
// of ~40 hand-typed italic grey paragraphs.
export function EmptyState({ children, py = 8, size = 'base', as = 'p', colSpan, className = '', bordered = false, action }: EmptyStateProps) {
  const cls = `text-center ${PY[py]} text-slate-500 font-semibold italic ${SIZE[size]} ${className}`.replace(/\s+/g, ' ').trim();
  if (bordered || action) {
    return (
      <div className={`text-center ${PY[py]} ${bordered ? 'border border-dashed border-slate-200 rounded-xl bg-white' : ''} ${className}`.replace(/\s+/g, ' ').trim()}>
        <p className={`text-slate-500 font-semibold italic ${SIZE[size]}`.trim()}>{children}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
    );
  }
  if (as === 'td') return <td colSpan={colSpan} className={cls}>{children}</td>;
  if (as === 'div') return <div className={cls}>{children}</div>;
  return <p className={cls}>{children}</p>;
}
