'use client';

import React from 'react';
import type { Team } from '@/lib/hrData';
import { Button } from '@/components/ui/Button';
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


// Which channel is open. Rendered only when there is more than one to pick from.
export function ChannelSelector({ teams, activeTeamId, onSelect, oversight, mobileStyle }: ChannelSelectorProps) {
  return (
    <>
      <div className={`md:w-56 shrink-0 md:flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-1 md:pb-0 scrollbar-hide px-1 md:px-0 ${mobileStyle === 'dropdown' ? 'hidden' : 'flex'}`}>
        {teams.map(t => (
          <Button
            key={t.id}
            variant={activeTeamId === t.id ? 'primary' : 'secondary'}
            onClick={() => onSelect(t.id)}
            aria-current={activeTeamId === t.id ? 'true' : undefined}
            className="shrink-0 justify-start text-left whitespace-nowrap md:whitespace-normal"
          >
            <span>
              {t.name}
              {oversight && <span className={`hidden md:block text-caption font-semibold mt-0.5 ${activeTeamId === t.id ? 'text-orange-100' : 'text-slate-500'}`}>{t.members.length} members</span>}
            </span>
          </Button>
        ))}
      </div>

      {mobileStyle === 'dropdown' && (
        <div className="md:hidden shrink-0 px-1">
          <Select value={activeTeamId || ''} onChange={e => onSelect(e.target.value)} fieldSize="md" chevron>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </div>
      )}
    </>
  );
}
