import React from 'react';
import { FlagIcon as Flag } from '@/components/ui/icons';

// An AirDrop-style mark: a dot with two open arcs around it (open at the bottom), centred in a 24 x 24 box.
const ARCS = [{ r: 6, delay: '0.25s' }, { r: 10, delay: '0.5s' }];
const arc = (r: number) => { const o = r * Math.SQRT1_2; return `M${(12 - o).toFixed(3)} ${(12 + o).toFixed(3)} A${r} ${r} 0 1 1 ${(12 + o).toFixed(3)} ${(12 + o).toFixed(3)}`; };

/** The tile on the shift card. With GPS (USA staff, whose phone starts and ends the shift) it is an AirDrop-style mark whose arcs light up in turn, while on shift; it stops and turns red when the shift ends. Without GPS it is the plain flag. */
export function ShiftStatusIcon({ active, gps }: { active: boolean; gps: boolean }) {
  const tone = active ? 'bg-emerald-100 text-emerald-700' : gps ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-400';
  return (
    <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
      {gps ? (
        <>
          <svg viewBox="0 0 24 24" className="relative h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
            {ARCS.map(a => <path key={a.r} d={arc(a.r)} className={active ? 'airdrop-arc' : undefined} style={active ? { animationDelay: a.delay } : undefined} />)}
          </svg>
        </>
      ) : <Flag className="h-5 w-5" />}
    </div>
  );
}
