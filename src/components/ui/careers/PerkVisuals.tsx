import React from 'react';
import { CurrencyDollarIcon as DollarSign, CalendarCheckIcon as CalendarCheck, UsersIcon as Users, SparkleIcon as Sparkle, CodeIcon as Code, DatabaseIcon as Database, TruckIcon as Truck, PackageIcon as Package, CpuIcon as Cpu, TerminalIcon as Terminal } from '@/components/ui/icons';

// The four pictures for the "Life at DelCargo" cards, one per perk. All decorative (the words next to them say it).
// Colours are the landing page's: ink (text, lines), brand (the orange), so they follow light and dark.

const CELL = 'flex items-center justify-center border border-ink/10';
const FADE = '[mask-image:radial-gradient(ellipse_90%_90%_at_50%_50%,#000_55%,transparent_100%)]';

// Good Salary: a fading grid with a lit cell, a dollar sign in it, hopping from cell to cell.
const SALARY_CELL = '4.5rem';
export function SalaryGrid() {
  const cols = 9, rows = 3;
  return (
    <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <div className={`relative grid ${FADE}`} style={{ gridTemplateColumns: `repeat(${cols}, ${SALARY_CELL})`, gridTemplateRows: `repeat(${rows}, ${SALARY_CELL})` }}>
        {Array.from({ length: cols * rows }, (_, i) => <div key={i} className={CELL} />)}
        <div className="perk-hop-salary absolute left-0 top-0 flex items-center justify-center bg-brand/25" style={{ width: SALARY_CELL, height: SALARY_CELL }}>
          <DollarSign weight="duotone" className="h-9 w-9 text-brand" />
        </div>
      </div>
    </div>
  );
}

// Accrued PTOs: a month of days with a few taken (breathing) and a marker hopping from day to day.
const TAKEN = new Set([3, 4, 9, 10, 17, 18, 24]);
export function LeaveCalendar() {
  const cols = 7, rows = 4;
  return (
    <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <div className={`relative grid gap-1.5 ${FADE}`} style={{ gridTemplateColumns: `repeat(${cols}, 2.75rem)` }}>
        {Array.from({ length: cols * rows }, (_, i) => (
          <div key={i} className={`h-11 w-11 rounded-xl ${TAKEN.has(i) ? 'perk-pulse bg-brand/25' : 'bg-ink/6'}`} style={TAKEN.has(i) ? { animationDelay: `${(i % 5) * 0.6}s` } : undefined} />
        ))}
        <div className="perk-hop-calendar absolute left-0 top-0 flex h-11 w-11 items-center justify-center rounded-xl bg-brand">
          <CalendarCheck weight="fill" className="h-5 w-5 text-brandfg-inv" />
        </div>
      </div>
    </div>
  );
}

// Learning & Tech: an editor window rising from the bottom of its card. The code is for show.
const CODE: React.ReactNode[] = [
  <><span className="text-brand">export function</span> Warehouse() {'{'}</>,
  <>{'  '}<span className="text-brand">const</span> {'{ stock }'} = useLive();</>,
  <>{'  '}<span className="text-brand">return</span> {'<Route status="on-time" />'}</>,
  <>{'}'}</>,
];
function CodeWindow() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-x-8 top-[48%] h-40 rounded-3xl bg-brand/20 blur-3xl" />
      <div className="absolute left-6 right-[-3rem] top-[46%] overflow-hidden rounded-2xl bg-paper shadow-[0_-8px_40px_color-mix(in_srgb,var(--ln-ink)_12%,transparent)]">
        <div className="flex items-center gap-4 px-5 py-3">
          <div className="flex gap-1.5">{[0, 1, 2].map(i => <span key={i} className="h-2.5 w-2.5 rounded-full bg-ink/20" />)}</div>
          <span className="text-xs text-ink/50">Warehouse.tsx</span>
        </div>
        <div className="border-t border-ink/10" />
        <pre className="overflow-hidden px-5 py-4 font-mono text-[13px] leading-6 text-ink/80">
          {CODE.map((line, i) => (
            <div key={i} className="perk-type whitespace-pre" style={{ '--line': i } as React.CSSProperties}>
              {line}{i === CODE.length - 1 && <span className="perk-caret ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 bg-brand" />}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

// The tools of the trade as tiles riding a curve across the top of the card (a row of them standing still for reduced
// motion). Tiles alternate orange and ink so the belt reads in both themes.
const BELT_PATH = 'M-40 120C20 120 55 60 185.5 60C316 60 351 120 411 120';
const BELT_ICONS = [Code, Database, Truck, Package, Cpu, Terminal];
const BELT_SECONDS = 24;

function TechBelt() {
  const step = BELT_SECONDS / BELT_ICONS.length;
  return (
    <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[44%]">
      <svg viewBox="0 0 371 150" fill="none" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full motion-reduce:hidden">
        {BELT_ICONS.map((Icon, i) => (
          <g key={i}>
            <animateMotion dur={`${BELT_SECONDS}s`} begin={`${-i * step}s`} repeatCount="indefinite" calcMode="linear" rotate="auto" path={BELT_PATH} />
            <foreignObject x="-28" y="-28" width="56" height="56" className="overflow-visible">
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg ${i % 2 ? 'bg-ink text-paper' : 'bg-brand text-brandfg-inv'}`}>
                <Icon weight="duotone" className="h-7 w-7" />
              </div>
            </foreignObject>
          </g>
        ))}
      </svg>
      <div className="absolute inset-0 hidden items-center justify-center gap-2 motion-reduce:flex">
        {BELT_ICONS.map((Icon, i) => (
          <div key={i} className={`flex h-11 w-11 items-center justify-center rounded-xl ${i % 2 ? 'bg-ink text-paper' : 'bg-brand text-brandfg-inv'}`}><Icon weight="duotone" className="h-6 w-6" /></div>
        ))}
      </div>
    </div>
  );
}

// Learning & Tech: the tool belt above, the editor typing below.
export function LearningVisual() {
  return (
    <>
      <TechBelt />
      <CodeWindow />
    </>
  );
}

// Parental Leaves: a ring around a people tile; a sparkle travels round it (two still ones for reduced motion).
export function FamilyOrbit() {
  return (
    <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
      <div className="relative h-[7.5rem] w-56">
        <svg viewBox="0 0 229 109" fill="none" className="absolute left-0 top-3 h-[109px] w-full overflow-visible">
          <ellipse cx="114.5" cy="54.5" rx="113" ry="53" stroke="currentColor" strokeWidth="1.5" className="text-ink/25" />
          <g className="text-ink motion-reduce:hidden">
            {[0, 1].map(i => (
              <g key={i}>
                <animateMotion dur="9s" begin={`${-i * 4.5}s`} repeatCount="indefinite" path="M1.5 54.5a113 53 0 1 0 226 0a113 53 0 1 0 -226 0" />
                <path d="M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8Z" fill="currentColor" />
              </g>
            ))}
          </g>
        </svg>
        <div className="perk-float absolute left-1/2 top-0 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand">
          <Users weight="duotone" className="h-8 w-8 text-brandfg-inv" />
        </div>
        <Sparkle weight="fill" className="absolute left-[11.75rem] top-[4.25rem] hidden h-3.5 w-3.5 text-ink motion-reduce:block" />
        <Sparkle weight="fill" className="absolute left-8 top-[6.25rem] hidden h-3 w-3 text-ink motion-reduce:block" />
      </div>
    </div>
  );
}
