'use client';

import React from 'react';
import { Headset, User } from 'lucide-react';
import { SearchInput } from '@/components/ui/SearchInput';

export type StatusFilter = 'all' | 'open' | 'closed';
export type DeptFilter = 'all' | 'hr' | 'technical';
export type ViewTab = 'assigned' | 'my_tickets';

interface TicketFilterBarProps {
  // Technical Support members (not Admin) switch between the incoming queue and their own tickets.
  showTechTabs: boolean;
  viewTab: ViewTab;
  onViewTab: (tab: ViewTab) => void;
  shown: number;
  total: number;
  isPrivileged: boolean;
  search: string;
  onSearch: (value: string) => void;
  status: StatusFilter;
  onStatus: (status: StatusFilter) => void;
  // Admin also filters by department.
  showDept: boolean;
  dept: DeptFilter;
  onDept: (dept: DeptFilter) => void;
}

const STATUSES: StatusFilter[] = ['all', 'open', 'closed'];
const DEPTS: { value: DeptFilter; label: string }[] = [
  { value: 'all', label: 'All Depts' },
  { value: 'hr', label: 'HR' },
  { value: 'technical', label: 'Tech' },
];

// Sits above the scrollable ticket list, not inside it, so it stays reachable at any scroll position.
export function TicketFilterBar({ showTechTabs, viewTab, onViewTab, shown, total, isPrivileged, search, onSearch, status, onStatus, showDept, dept, onDept }: TicketFilterBarProps) {
  return (
    <>
      {showTechTabs && (
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          {([['assigned', Headset, 'Support Queue'], ['my_tickets', User, 'My Tickets']] as const).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onViewTab(value)}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                viewTab === value ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      )}

      <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
        Tickets ({shown}{shown !== total ? ` of ${total}` : ''})
      </h3>

      <div className="space-y-2">
        <SearchInput fieldSize="sm" value={search} onChange={onSearch} placeholder={isPrivileged ? 'Search by title, employee, or details…' : 'Search your tickets…'} />
        <div className="flex items-center justify-between gap-1.5 flex-wrap">
          <div className="flex items-center gap-1.5">
            {STATUSES.map(f => (
              <button
                key={f}
                type="button"
                onClick={() => onStatus(f)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  status === f ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {f === 'all' ? 'All' : f === 'open' ? 'Open' : 'Closed'}
              </button>
            ))}
          </div>

          {showDept && (
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-full border border-slate-200">
              {DEPTS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => onDept(d.value)}
                  className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider transition-colors ${
                    dept === d.value ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
