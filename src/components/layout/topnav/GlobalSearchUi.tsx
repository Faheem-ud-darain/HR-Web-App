'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { SearchInput } from '@/components/ui/SearchInput';
import { SearchResults } from './SearchResults';
import type { GlobalSearch } from './useGlobalSearch';

// The search box in the top bar (tablet and desktop) with its results dropdown.
export function DesktopSearch({ s }: { s: GlobalSearch }) {
  return (
    <div className="hidden md:flex flex-1 items-center max-w-md relative">
      <SearchInput
        fieldSize="pill"
        wrapperClassName="w-full"
        style={{ paddingLeft: '2.5rem' }}
        value={s.search}
        onChange={s.onValue}
        onFocus={s.onFocus}
        placeholder="Search employees, tasks, payroll, leaves..."
      />
      {s.showResults && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-[60vh] overflow-y-auto divide-y divide-slate-100 popover-enter">
          <SearchResults results={s.results} role={s.role} limit={4} onGo={s.go} />
        </div>
      )}
    </div>
  );
}

// Phones: the magnifier button in the top bar...
export function MobileSearchButton({ s }: { s: GlobalSearch }) {
  return (
    <button onClick={s.openMobile} aria-label="Search" className="md:hidden p-2 rounded-full text-slate-500 hover:bg-slate-100 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center">
      <Search className="h-5 w-5" />
    </button>
  );
}

// ...and the full-height sheet it slides up, with every result uncapped.
export function MobileSearchSheet({ s }: { s: GlobalSearch }) {
  if (!s.mobileOpen) return null;
  return (
    <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm fade-enter" onClick={s.closeMobile} />
      <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col w-full h-[85vh] drawer-enter-bottom">
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="h-1.5 w-12 bg-slate-200 rounded-full" />
        </div>
        <div className="flex items-center gap-3 px-4 pb-3 border-b border-slate-100 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={s.search}
              onChange={e => s.onValue(e.target.value)}
              autoFocus
              placeholder="Search anything..."
              className="w-full bg-slate-100/70 border border-transparent rounded-xl py-3 pl-10 pr-4 text-[16px] focus:border-slate-300 outline-none text-slate-900 focus:bg-slate-50 transition-colors font-medium"
            />
          </div>
          <button onClick={s.closeMobile} className="text-[15px] font-semibold text-slate-500 hover:text-slate-800 transition-colors px-1">Cancel</button>
        </div>
        <div className="flex-1 overflow-y-auto pb-safe">
          {s.showResults && (
            <div className="divide-y divide-slate-100">
              <SearchResults results={s.results} role={s.role} onGo={s.go} />
            </div>
          )}
          {!s.search.trim() && <div className="p-8 text-center text-slate-400 font-medium text-sm">Start typing to search across all records</div>}
        </div>
      </div>
    </div>
  );
}
