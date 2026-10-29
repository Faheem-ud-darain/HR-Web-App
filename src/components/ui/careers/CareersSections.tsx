import React from 'react';
import { GiftIcon as Gift, CurrencyDollarIcon as DollarSign, CalendarCheckIcon as CalendarCheck, LaptopIcon as Laptop, UsersIcon as Users } from '@/components/ui/icons';
import type { Icon } from '@phosphor-icons/react';

const PERKS = [
  { title: 'Good Salary', text: 'We offer competitive salaries calibrated for regional standards, with guaranteed annual increments.' },
  { title: 'Accrued PTOs', text: 'Accrue leave balance every month with cashing out settlements.' },
  { title: 'Learning & Tech', text: 'Collaborate using modern architectures, framework toolsets, and clean design structures.' },
  { title: 'Parental Leaves', text: 'Gender-balanced opportunities including fully paid Parental Leaves.' },
];

// One icon per perk, in the same order as PERKS.
const PERK_ICONS: Icon[] = [DollarSign, CalendarCheck, Laptop, Users];

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
          <h2 className="font-display text-4xl sm:text-6xl font-black uppercase tracking-tight text-white leading-[0.95]">Who We Are</h2>
        </div>
        <p className="text-sm sm:text-base text-white/80 leading-relaxed">
          DelCargo is a leading-edge global logistics and software engineering provider. We combine digital shipping architectures with physical distribution hubs to enable intelligent supply chain management. By fusing freight yards with automated tracking platforms, we help scale global commerce.
        </p>
        <p className="text-sm sm:text-base text-white/60 leading-relaxed">
          We maintain strategic warehousing facilities in major transit centers across North America and remote design cells in South Asia, operating with around-the-clock synchrony to keep supply lines operating optimally.
        </p>
        <div className="grid grid-cols-3 gap-3 sm:gap-6 pt-6 border-t border-white/10">
          {stats.map(s => (
            <div key={s.label}>
              <p className="font-display text-4xl sm:text-6xl font-black text-brand leading-none">{s.value}</p>
              <p className="text-caption text-white/55 font-bold uppercase tracking-wider mt-2">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-6 relative overflow-hidden rounded-3xl border border-white/10">
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

// The perks as a ruled grid of four, like a spec sheet.
export function LifeAtDelcargo() {
  return (
    <section id="life-at-delcargo" className="scroll-mt-24 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
      <div className="lg:col-span-4 space-y-3">
        <p className={EYEBROW}>Perks & Compensation</p>
        <h2 className="font-display text-4xl sm:text-6xl font-black uppercase tracking-tight text-white leading-[0.95]">Life at DelCargo</h2>
      </div>
      <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 border border-white/10 rounded-3xl overflow-hidden">
        {PERKS.map((p, i) => {
          const PerkIcon = PERK_ICONS[i];
          return (
            <div key={p.title} className="space-y-3 p-6 sm:p-8 border-white/10 not-first:border-t sm:nth-[2]:border-t-0 sm:even:border-l">
              <PerkIcon weight="duotone" className="h-7 w-7 text-brand" aria-hidden="true" />
              <h3 className="font-display font-bold text-sm uppercase tracking-wider text-white">{p.title}</h3>
              <p className="text-sm text-white/65 leading-relaxed">{p.text}</p>
            </div>
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
