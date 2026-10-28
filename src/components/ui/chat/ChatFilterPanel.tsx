'use client';

import React from 'react';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr';
import { Input, Select } from '@/components/ui/Input';
import { SearchInput } from '@/components/ui/SearchInput';
import type { FileTypeFilter, SizeFilter } from './chatHelpers';
import type { useChatFilters } from './useChatFilters';

// The search / date / file-type / size bar that drops down above the messages.
export function ChatFilterPanel({ filters }: { filters: ReturnType<typeof useChatFilters> }) {
  return (
    <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3 shrink-0 space-y-2.5">
      <SearchInput fieldSize="sm" value={filters.searchQuery} onChange={filters.setSearchQuery} placeholder="Search messages, senders, or file names…" />
      <div className="flex flex-wrap gap-2 items-center">
        <Input type="date" value={filters.dateFrom} onChange={e => filters.setDateFrom(e.target.value)} fieldSize="md" />
        <span className="text-[11px] text-slate-500 font-bold">to</span>
        <Input type="date" value={filters.dateTo} onChange={e => filters.setDateTo(e.target.value)} fieldSize="md" />

        <Select value={filters.fileTypeFilter} onChange={e => filters.setFileTypeFilter(e.target.value as FileTypeFilter)} fieldSize="md">
          <option value="all">All types</option>
          <option value="image">Images</option>
          <option value="document">Documents</option>
          <option value="other">Other files</option>
          <option value="none">Text only</option>
          <option value="announcement">Announcements</option>
        </Select>

        <Select value={filters.sizeFilter} onChange={e => filters.setSizeFilter(e.target.value as SizeFilter)} fieldSize="md">
          <option value="all">Any size</option>
          <option value="small">Small (&lt;1MB)</option>
          <option value="medium">Medium (1–5MB)</option>
          <option value="large">Large (&gt;5MB)</option>
        </Select>

        {filters.hasActiveFilters && (
          <button onClick={filters.clear} className="flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 ml-auto">
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>
    </div>
  );
}
