'use client';

import React from 'react';
import type { Team } from '@/lib/hrData';
import { Select } from '@/components/ui/Input';

interface ChannelSelectorProps {
  teams: Team[];
  activeTeamId: string | null;
  onSelect: (teamId: string) => void;
  // Admin's oversight view shows every team, with its member count.
  oversight: boolean;
  // 'horizontal' = a scrolling row of pills on phones; 'dropdown' = a native <select> on phones.
  mobileStyle: 'horizontal' | 'dropdown';
}

const CHEVRON = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%2364748b\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")';

// Which channel is open. Rendered only when there is more than one to pick from.
export function ChannelSelector({ teams, activeTeamId, onSelect, oversight, mobileStyle }: ChannelSelectorProps) {
  return (
    <>
      <div className={`md:w-56 shrink-0 md:flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-1 md:pb-0 scrollbar-hide px-1 md:px-0 ${mobileStyle === 'dropdown' ? 'hidden' : 'flex'}`}>
        {teams.map(t => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`px-4 py-2 md:py-2.5 rounded-xl text-xs font-bold text-left whitespace-nowrap md:whitespace-normal transition-colors transition-shadow shrink-0 ${
              activeTeamId === t.id ? 'bg-orange-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t.name}
            {oversight && <span className={`hidden md:block text-[9px] font-semibold mt-0.5 ${activeTeamId === t.id ? 'text-orange-100' : 'text-slate-400'}`}>{t.members.length} members</span>}
          </button>
        ))}
      </div>

      {mobileStyle === 'dropdown' && (
        <div className="md:hidden shrink-0 px-1">
          <Select
            value={activeTeamId || ''}
            onChange={e => onSelect(e.target.value)}
            fieldSize="md"
            className="appearance-none"
            style={{ backgroundImage: CHEVRON, backgroundPosition: 'right 1rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1rem' }}
          >
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </div>
      )}
    </>
  );
}
