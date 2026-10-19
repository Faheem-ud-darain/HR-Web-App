// Shared pagination primitive — plan 010. These four lists (HR/Admin
// Payroll, Admin Master Reports, AbsenceDetailsView's two lists) all
// render their full filtered array unconditionally, with no cap — fine at
// today's headcount, but the kind of thing that degrades quietly (slower
// render, slower re-filter-on-keystroke) as the company grows rather than
// failing with an obvious error. This slices AFTER whatever filtering a
// page already does — it never changes filter/search logic, only how much
// of the already-filtered result renders at once.
'use client';

import { useMemo, useState } from 'react';

export interface UsePaginationResult<T> {
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  pageItems: T[];
}

export function usePagination<T>(items: T[], pageSize: number): UsePaginationResult<T> {
  const [requestedPage, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // If the underlying list shrinks (a filter narrows results, a record is
  // deleted) and the requested page no longer exists, show the last real page
  // instead of an empty list that looks broken. Derived, not stored: if the list
  // grows back, the person's requested page is honoured again.
  const page = Math.min(requestedPage, totalPages);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return { page, setPage, totalPages, pageItems };
}
