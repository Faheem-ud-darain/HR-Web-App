'use client';

import React, { useState } from 'react';
import { MapPinIcon as MapPin, ArrowRightIcon as ArrowRight, PlusIcon as Plus } from '@/components/ui/icons';
import type { CareerPosition } from '@/lib/hrData';
import { DEPARTMENTS } from '@/components/ui/careers/careerOptions';

interface PublicJobListProps {
  positions: CareerPosition[];
  onApply: (job: CareerPosition) => void;
}

// The open positions for outside candidates on the dark landing page: filter chips, then one ruled list per department.
// A row shows the title and place; opening it shows the description, requirements and the Apply button.
export function PublicJobList({ positions, onApply }: PublicJobListProps) {
  const [category, setCategory] = useState('All');
  const [openId, setOpenId] = useState<string | null>(null);
  const shown = category === 'All' ? positions : positions.filter(j => j.department.toLowerCase() === category.toLowerCase());
  const groups = Array.from(new Set(shown.map(j => j.department)));

  return (
    <section id="open-positions" className="scroll-mt-24 space-y-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="font-display text-4xl sm:text-6xl font-black uppercase tracking-tight text-ink leading-[0.95]">Open Positions ({shown.length})</h2>
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          {['All', ...DEPARTMENTS].map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              aria-pressed={category === cat}
              className={`shrink-0 rounded-full px-4 min-h-9 text-xs font-bold uppercase tracking-wider border transition-colors ${
                category === cat ? 'bg-brand border-transparent text-black' : 'border-ink/15 text-ink/70 hover:text-ink hover:border-ink/40'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {groups.map(dept => (
        <div key={dept} className="space-y-1">
          <p className="rounded-xl bg-ink/6 px-4 sm:px-6 py-3 text-caption font-bold uppercase tracking-widest text-brand">{dept}</p>
          {shown.filter(j => j.department === dept).map(job => {
            const open = openId === job.id;
            return (
              <div key={job.id} className="border-b border-ink/10">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : job.id)}
                  aria-expanded={open}
                  className="group flex w-full items-center gap-4 px-4 sm:px-6 py-5 text-left"
                >
                  <span className="flex-1 min-w-0 font-bold text-ink text-base sm:text-lg tracking-tight group-hover:text-brand transition-colors">{job.title}</span>
                  <span className="hidden sm:flex items-center gap-1.5 text-sm text-ink/60"><MapPin className="h-4 w-4" aria-hidden="true" /> {job.location}</span>
                  <Plus className={`h-5 w-5 shrink-0 text-ink/60 transition-transform duration-300 ${open ? 'rotate-45 text-brand' : ''}`} aria-hidden="true" />
                </button>
                {open && (
                  <div className="px-4 sm:px-6 pb-7 space-y-5 popover-enter">
                    <span className="sm:hidden flex items-center gap-1.5 text-sm text-ink/60"><MapPin className="h-4 w-4" aria-hidden="true" /> {job.location}</span>
                    <p className="text-sm text-ink/80 leading-relaxed max-w-3xl">{job.description}</p>
                    {job.requirements.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-caption font-bold uppercase tracking-widest text-ink/50">Requirements</p>
                        <ul className="space-y-1.5 max-w-3xl">
                          {job.requirements.map((req, i) => (
                            <li key={i} className="text-sm text-ink/70 border-l-2 border-ink/15 pl-3">{req}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onApply(job)}
                      className="inline-flex items-center gap-2 rounded-full bg-brand px-5 min-h-11 text-xs font-bold uppercase tracking-wider text-black hover:opacity-90 transition-opacity"
                    >
                      Apply now <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {shown.length === 0 && (
        <div className="text-center py-16 px-4 text-ink/50 italic text-sm border border-dashed border-ink/15 rounded-2xl">
          No vacancies listed in this category.
        </div>
      )}
    </section>
  );
}
