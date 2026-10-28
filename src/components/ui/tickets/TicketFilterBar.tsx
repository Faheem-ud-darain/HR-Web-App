'use client';

import React from 'react';
import { HeadsetIcon as Headset, UserIcon as User } from '@/components/ui/icons';
import { SearchInput } from '@/components/ui/SearchInput';
import { Tabs, type TabItem } from '@/components/ui/Tabs';

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

const STATUS_ITEMS: TabItem<StatusFilter>[] = [{ value: 'all', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }];
const DEPT_ITEMS: TabItem<DeptFilter>[] = [{ value: 'all', label: 'All depts' }, { value: 'hr', label: 'HR' }, { value: 'technical', label: 'Tech' }];
const VIEW_ITEMS: TabItem<ViewTab>[] = [
  { value: 'assigned', label: 'Support queue', icon: <Headset className="h-3.5 w-3.5" /> },
  { value: 'my_tickets', label: 'My tickets', icon: <User className="h-3.5 w-3.5" /> },
];

// Sits above the scrollable ticket list, not inside it, so it stays reachable at any scroll position.
export function TicketFilterBar({ showTechTabs, viewTab, onViewTab, shown, total, isPrivileged, search, onSearch, status, onStatus, showDept, dept, onDept }: TicketFilterBarProps) {
  return (
    <>
      {showTechTabs && <Tabs variant="segmented" fill value={viewTab} onChange={onViewTab} items={VIEW_ITEMS} aria-label="Ticket list" />}

      <h2 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
        Tickets ({shown}{shown !== total ? ` of ${total}` : ''})
      </h2>

      <div className="space-y-2">
        <SearchInput fieldSize="sm" value={search} onChange={onSearch} placeholder={isPrivileged ? 'Search by title, employee, or details…' : 'Search your tickets…'} />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Tabs variant="chips" compact value={status} onChange={onStatus} items={STATUS_ITEMS} aria-label="Ticket status" />
          {showDept && <Tabs variant="segmented" compact value={dept} onChange={onDept} items={DEPT_ITEMS} aria-label="Department" />}
        </div>
      </div>
    </>
  );
}
