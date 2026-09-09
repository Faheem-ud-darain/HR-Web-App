'use client';

// Prev/Next + "page X of Y" control for the four lists paginated by plan
// 010. Renders once, below both a page's desktop <table> and mobile card
// stack (never duplicated inside each) — matching how e.g.
// hr/payroll/page.tsx's stat cards already sit outside that hidden
// md:block / md:hidden split. Pill styling matches the existing All/
// Pending/Processed tab-pill pattern on that same page (bg-slate-100
// container, bg-white active/current pill) for visual consistency with
// the nearest existing control on the pages this is used on.

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
  totalCount: number;
  itemLabel?: string; // e.g. "employees", "records" — defaults to "items"
}

export function PaginationControls({ page, totalPages, setPage, totalCount, itemLabel = 'items' }: PaginationControlsProps) {
  if (totalCount === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-2">
      <p className="text-[11px] font-semibold text-slate-500">
        {totalCount} {itemLabel} total · Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
        <button
          type="button"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 hover:text-slate-950 bg-transparent hover:bg-white/60 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <span className="px-2 py-1.5 text-xs font-bold text-slate-900 bg-white rounded-md shadow-sm min-w-[3.5rem] text-center">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 hover:text-slate-950 bg-transparent hover:bg-white/60 disabled:hover:bg-transparent"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
