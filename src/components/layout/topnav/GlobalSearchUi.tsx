'use client';

import React from 'react';
import { MagnifyingGlassIcon as Search } from '@phosphor-icons/react/dist/ssr';
import { SearchInput } from '@/components/ui/SearchInput';
import { IconButton } from '@/components/ui/IconButton';
import { Modal } from '@/components/ui/Modal';
import { SearchResults } from './SearchResults';
import type { GlobalSearch } from './useGlobalSearch';

// What opens search on tablet and desktop: a wide "Search…  Ctrl K" field in the middle of the bar.
export function SearchField({ s }: { s: GlobalSearch }) {
  return (
    <button
      type="button"
        onClick={s.openSearch}
        aria-label="Search"
        className="hidden md:flex items-center gap-2 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 text-sm text-slate-500 transition-colors"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left truncate">Search people, tickets, payroll…</span>
        <kbd className="hidden lg:inline rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-caption font-semibold text-slate-500">Ctrl K</kbd>
      </button>
  );
}

// ...and on phones, a magnifier button with the other icons.
export function SearchIconButton({ s }: { s: GlobalSearch }) {
  return (
    <IconButton label="Search" onClick={s.openSearch} className="md:hidden">
      <Search className="h-5 w-5" />
    </IconButton>
  );
}

// The search itself, in the app's shared dialog: a sheet you can swipe away on phones, a centred card on larger
// screens. Typing also filters the page behind it (see useGlobalSearch).
export function SearchDialog({ s }: { s: GlobalSearch }) {
  return (
    <Modal isOpen={s.open} onClose={s.closeSearch} title="Search" className="md:max-w-xl">
      <SearchInput autoFocus clearable fieldSize="md" value={s.search} onChange={s.onValue} placeholder="Search anything…" />
      <div className="mt-3 -mx-2 max-h-[55vh] md:max-h-[50vh] overflow-y-auto divide-y divide-slate-100">
        {s.showResults
          ? <SearchResults results={s.results} role={s.role} onGo={s.go} />
          : <p className="p-8 text-center text-slate-500 font-medium text-sm">Start typing to search across all records.</p>}
      </div>
    </Modal>
  );
}
