import React from 'react';
import { GiftIcon as Gift } from '@/components/ui/icons';
import { SalaryGrid, LeaveCalendar, LearningVisual, FamilyOrbit } from '@/components/ui/careers/PerkVisuals';

const PERKS = [
  { title: 'Good Salary', text: 'We offer competitive salaries calibrated for regional standards, with guaranteed annual increments.' },
  { title: 'Accrued PTOs', text: 'Accrue leave balance every month with cashing out settlements.' },
  { title: 'Learning & Tech', text: 'Collaborate using modern architectures, framework toolsets, and clean design structures.' },
  { title: 'Parental Leaves', text: 'Gender-balanced opportunities including fully paid Parental Leaves.' },
];

const EYEBROW = 'text-caption font-bold uppercase tracking-widest text-brand';

// "Who We Are": company blurb, three live counts and a photo. Shown to outside candidates, on the dark landing page.
export function CompanyIntro({ warehouseCount, teamCount, openPositions }: { warehouseCount: number; teamCount: number; openPositions: number }) {
  const stats = [
    { value: warehouseCount, label: 'Active Warehouses' },
    { value: teamCount, label: 'Departments' },
    { value: openPositions, label: 'Open Positions' },
  ];
  return (
    <section id="who-we-are" className="scroll-mt-24 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
      <div className="lg:col-span-6 space-y-6">
        <div className="space-y-3">
          <span className={EYEBROW}>Global Freight & Software</span>
          <h2 className="font-display text-4xl sm:text-6xl font-black uppercase tracking-tight text-ink leading-[0.95]">Who We Are</h2>
        </div>
        <p className="text-sm sm:text-base text-ink/80 leading-relaxed">
          DelCargo is a leading-edge global logistics and software engineering provider. We combine digital shipping architectures with physical distribution hubs to enable intelligent supply chain management. By fusing freight yards with automated tracking platforms, we help scale global commerce.
        </p>
        <p className="text-sm sm:text-base text-ink/60 leading-relaxed">
          We maintain strategic warehousing facilities in major transit centers across North America and remote design cells in South Asia, operating with around-the-clock synchrony to keep supply lines operating optimally.
        </p>
        <div className="grid grid-cols-3 gap-3 sm:gap-6 pt-6 border-t border-ink/10">
          {stats.map(s => (
            <div key={s.label}>
              <p className="font-display text-4xl sm:text-6xl font-black text-brand leading-none">{s.value}</p>
              <p className="text-caption text-ink/60 font-bold uppercase tracking-wider mt-2">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-6 relative overflow-hidden rounded-3xl">
        <img
          src="/delcargo_warehouse_hightech.webp"
          alt="High Tech Warehouse"
          width={900}
          height={900}
          loading="lazy"
          decoding="async"
          className="w-full h-72 sm:h-[28rem] object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-5 sm:p-7">
          <p className={EYEBROW}>Operations Hub</p>
          <p className="text-white text-sm font-bold mt-0.5">Automated Warehouse JFK Center</p>
        </div>
      </div>
    </section>
  );
}

// The perks as a bento: one wide card, one tall card down the right, two equal cards under the wide one. Each card is a
// picture and the perk's words. (PERKS is in order: salary, leave, learning, parental.)
const PERK_VISUALS = [SalaryGrid, LeaveCalendar, LearningVisual, FamilyOrbit];
// Where each card sits on the large-screen grid: wide (two columns), tall (right, two rows), then the equal pair.
const PERK_PLACE = ['lg:col-span-2', 'lg:col-start-1 lg:row-start-2', 'lg:col-start-3 lg:row-span-2 lg:row-start-1', 'lg:col-start-2 lg:row-start-2'];
const PERK_HEIGHT = ['min-h-72', 'min-h-72', 'min-h-72 lg:min-h-0', 'min-h-72'];

export function LifeAtDelcargo() {
  return (
    <section id="life-at-delcargo" className="scroll-mt-24 space-y-10 sm:space-y-14">
      <div className="space-y-3">
        <p className={EYEBROW}>Perks & Compensation</p>
        <h2 className="font-display text-4xl sm:text-6xl font-black uppercase tracking-tight text-ink leading-[0.95]">Life at DelCargo</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
        {PERKS.map((p, i) => {
          const Visual = PERK_VISUALS[i];
          return (
            <article key={p.title} className={`relative flex flex-col overflow-hidden rounded-3xl bg-ink/5 ${PERK_PLACE[i]}`}>
              <div className={`relative flex-1 ${PERK_HEIGHT[i]}`}><Visual /></div>
              <div className="relative space-y-2 p-6 sm:p-8 pt-0">
                <h3 className="font-display font-black text-xl sm:text-2xl text-ink">{p.title}</h3>
                <p className="text-sm text-ink/60 leading-relaxed max-w-md">{p.text}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// Shown to employees on the same page.
export function ReferralProgramNote() {
  return (
    <section className="bg-orange-50/40 py-12 px-6 sm:px-12 border border-orange-100 rounded-xl space-y-4">
      <h3 className="text-lg font-bold text-slate-950 flex items-center gap-1.5">
        <Gift className="h-5 w-5 text-orange-600" /> Employee Referral Program
      </h3>
      <p className="text-xs text-slate-600 max-w-3xl leading-relaxed font-medium">
        Know someone who would be a perfect fit? Refer them! If your referred candidate gets selected and successfully completes <strong>6 months</strong> of service with DelCargo, you will receive a cash referral reward of <strong>PKR 10,000</strong>. Submissions can be sent directly to HR.
      </p>
    </section>
  );
}
