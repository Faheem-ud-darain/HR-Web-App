import React from 'react';

// The title block at the top of a page: the heading, one line saying what the page is for, and an optional control on
// the right (a button, a tab switch).
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-lg md:text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-xs md:text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
