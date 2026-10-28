'use client';

import React, { useMemo, useState } from 'react';
import { FunnelIcon as Filter } from '@phosphor-icons/react/dist/ssr';
import type { Profile } from '@/lib/hrData';
import { Select } from '@/components/ui/Input';
import { SearchInput } from '@/components/ui/SearchInput';

// Search + region + onboarding filters for the employee table on the HR and Admin Reports pages. The state is
// a hook so the page can still use the filtered rows (table, export, pagination reset).
export function useEmployeeFilters(employees: Profile[]) {
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState<'All' | 'USA' | 'Pakistan'>('All');
  const [onboarding, setOnboarding] = useState<'All' | 'Completed' | 'Pending'>('All');
  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter(emp =>
      (emp.fullName.toLowerCase().includes(q) || emp.email.toLowerCase().includes(q) || !!emp.jobTitle?.toLowerCase().includes(q)) &&
      (region === 'All' || emp.region === region) &&
      (onboarding === 'All' || (onboarding === 'Completed') === !!emp.onboardingCompleted),
    );
  }, [employees, search, region, onboarding]);
  return { search, setSearch, region, setRegion, onboarding, setOnboarding, rows };
}

export function EmployeeFilterBar({ filters }: { filters: ReturnType<typeof useEmployeeFilters> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
      <SearchInput fieldSize="md" value={filters.search} onChange={filters.setSearch} placeholder="Search employee or role..." />
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-slate-400 shrink-0" />
        <Select value={filters.region} onChange={e => filters.setRegion(e.target.value as typeof filters.region)} fieldSize="md" className="cursor-pointer">
          <option value="All">All Regions</option>
          <option value="USA">USA Only</option>
          <option value="Pakistan">Pakistan (Remote)</option>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-slate-400 shrink-0" />
        <Select value={filters.onboarding} onChange={e => filters.setOnboarding(e.target.value as typeof filters.onboarding)} fieldSize="md" className="cursor-pointer">
          <option value="All">All Onboarding Status</option>
          <option value="Completed">Completed Onboarding</option>
          <option value="Pending">Pending Onboarding</option>
        </Select>
      </div>
    </div>
  );
}
