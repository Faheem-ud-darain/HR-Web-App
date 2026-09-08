# 010 — Paginate/cap the large, unpaginated tables

- **Status**: TODO
- **Commit**: 59a9c20
- **Severity**: LOW (scales with headcount — not necessarily painful today, but degrades quietly rather than failing loudly)
- **Category**: Usability / scalability (usability pass, tracked here for the same reason plan 007 is)
- **Estimated scope**: 1 shared pagination primitive (~40-60 lines) + edits to 4 files' render logic. No data-layer changes — all four already fetch their full dataset via existing hooks; this only changes what's rendered at once.

## Problem

Every row in these lists renders unconditionally, every time, with no
pagination, virtualization, or "load more":

| File | List | Desktop render | Mobile render |
| --- | --- | --- | --- |
| `src/app/(dashboard)/hr/payroll/page.tsx` | `filteredData` (all employees' payroll rows) | line 249 | line 393 |
| `src/app/(dashboard)/admin/payroll/page.tsx` | `payroll` (all employees' payroll rows) | line 274 | line 330 |
| `src/app/(dashboard)/admin/reports/page.tsx` | `filteredEmployees` (full employee directory) | line 228 | line 293 |
| `src/components/ui/AbsenceDetailsView.tsx` | `filteredAbsences` (flat per-record list) / `employeeAbsenceSummaries` (per-employee rollup) | lines 839/895 | lines 857/924 |

This is not a confirmed performance problem today — I don't know this
company's actual headcount, and React handles a few dozen rows fine. It's
flagged because it's the kind of thing that degrades gradually as the
company grows (slower initial render, slower re-filter-on-keystroke since
`filteredData`/`filteredEmployees` recompute on every render) rather than
failing with an obvious error, so there's no natural trigger to notice it
until someone's already frustrated. Better to pick a threshold now.

## Target

A shared `usePagination(items, pageSize)` hook (returns the current page's
slice + page controls) and a small `<PaginationControls>` component (Prev/
Next + "page X of Y" + total count), applied to the four lists above. Default
page size: 25 rows (a reasonable middle ground for both desktop tables and
mobile card stacks — confirm against whichever of these four pages has the
most rows in practice today, if that's discoverable, and adjust before
committing to 25).

Filtering (search/tab) must reset the current page back to 1 — otherwise a
user could filter down to 3 results while sitting on "page 4" and see an
empty list that looks broken.

## Repo conventions to follow

- These four files already each maintain their own `filteredX` derived array
  via `.filter(...)` in the render body (see `hr/payroll/page.tsx`'s
  `filteredData`, `admin/reports/page.tsx`'s `filteredEmployees`,
  `AbsenceDetailsView.tsx`'s `filteredAbsences`) — pagination slices AFTER
  that existing filter step, it doesn't change the filtering logic itself.
- Both a desktop `<table>` and a mobile card-stack render exist side by side
  in every one of these files (`hidden md:block` / `md:hidden` pattern,
  consistent across the whole dashboard) — `<PaginationControls>` must work
  for both, and should render once below both variants (not duplicated
  inside each), matching how e.g. `hr/payroll/page.tsx`'s stat cards already
  sit outside the `hidden md:block` / `md:hidden` split.
- Visual style: match the existing tab-pill style already used for
  All/Pending/Processed filters in `hr/payroll/page.tsx` (`bg-slate-100`
  container, `bg-white` active pill) for Prev/Next buttons, for visual
  consistency with the nearest existing control on the same pages.

## Steps

1. Create `src/lib/usePagination.ts` (or alongside other small hooks in
   `src/lib/`, matching wherever similar small utility hooks already live) —
   `usePagination<T>(items: T[], pageSize: number)` returning
   `{ page, setPage, totalPages, pageItems }`.
2. Create `src/components/ui/PaginationControls.tsx` — Prev/Next + page
   indicator, disabled states at the first/last page, following the styling
   note above.
3. In each of the 4 files: after the existing filter derivation
   (`filteredData`/`filteredEmployees`/`filteredAbsences`/
   `employeeAbsenceSummaries`), call `usePagination` and render
   `pageItems.map(...)` instead of `filteredX.map(...)` in both the desktop
   and mobile render blocks. Render `<PaginationControls>` once, after both.
4. Reset to page 1 whenever the underlying filter/search/tab state changes —
   add the filter state (search query, active tab, selected date, etc.,
   whichever this file already has) to a `useEffect` dependency array that
   calls `setPage(1)`.
5. `AbsenceDetailsView.tsx` needs this applied twice independently — once for
   `filteredAbsences` (the employee's own flat view) and once for
   `employeeAbsenceSummaries` (the HR/Admin per-employee rollup) — these are
   two different lists shown depending on `role`, both need their own
   pagination state.

## Boundaries

- Do NOT change any filtering/search logic — only what subset of the
  already-filtered array gets rendered.
- Do NOT paginate the CSV export in any of these files (`exportPayrollCSV`,
  `exportCSV`, etc.) — exports must still include every filtered row, not
  just the current page.
- Do NOT add virtualization (react-window etc.) — plain pagination is
  sufficient at the scale implied by this app (an internal company HR tool,
  not a consumer feed) and avoids a new dependency.
- Do NOT touch any other list in the app not named in the Problem table
  above unless a follow-up audit specifically calls it out — this plan is
  scoped to the 4 confirmed unpaginated large lists, not a blanket pass.

## Verification

- **Mechanical**: `npx tsc --noEmit -p tsconfig.json` — zero errors.
- **Manual**: on each of the 4 pages, confirm:
  - Only `pageSize` rows render at a time, with working Prev/Next.
  - Changing the search box or active tab/filter resets back to page 1
    rather than landing on a stale, possibly out-of-range page.
  - CSV export (where present) still exports every filtered row, not just
    the visible page.
- **Done when**: all 4 lists render a bounded page size regardless of total
  row count, with correct Prev/Next behavior and no export regression.
