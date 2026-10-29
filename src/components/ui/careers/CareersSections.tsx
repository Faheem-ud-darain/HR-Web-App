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

// "Who We Are": company blurb, three live counts and a photo. Shown to outside candidates only.
export function CompanyIntro({ warehouseCount, teamCount, openPositions }: { warehouseCount: number; teamCount: number; openPositions: number }) {
  const stats = [
    { value: warehouseCount, label: 'Active Warehouses' },
    { value: teamCount, label: 'Departments' },
    { value: openPositions, label: 'Open Positions' },
  ];
  return (
    <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-12 mb-8 shadow-sm overflow-hidden font-sans">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center">
        <div className="lg:col-span-7 space-y-5 sm:space-y-6">
          <div className="space-y-2">
            <span className="inline-block text-caption font-bold text-orange-600 uppercase tracking-widest bg-orange-50 border border-orange-100 px-3 py-1 rounded-full">
              Global Freight & Software
            </span>
            <h3 className="font-display text-2xl sm:text-4xl font-bold text-slate-900 uppercase tracking-tight mt-2">Who We Are</h3>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed font-semibold">
            DelCargo is a leading-edge global logistics and software engineering provider. We combine digital shipping architectures with physical distribution hubs to enable intelligent supply chain management. By fusing freight yards with automated tracking platforms, we help scale global commerce.
          </p>
          <p className="text-xs text-slate-600 leading-relaxed font-medium">
            We maintain strategic warehousing facilities in major transit centers across North America and remote design cells in South Asia, operating with around-the-clock synchrony to keep supply lines operating optimally.
          </p>

          <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-4 border-t border-slate-100">
            {stats.map(s => (
              <div key={s.label} className="text-center sm:text-left">
                <p className="font-display text-3xl sm:text-5xl font-black text-orange-600 leading-none">{s.value}</p>
                <p className="text-caption text-slate-500 font-bold uppercase tracking-wider mt-1.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 relative group overflow-hidden rounded-2xl border border-slate-200 shadow">
          <img
            src="/delcargo_warehouse_hightech.webp"
            alt="High Tech Warehouse"
            width={900}
            height={900}
            loading="lazy"
            decoding="async"
            className="w-full h-48 sm:h-64 object-cover object-center group-hover:scale-103 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent flex flex-col justify-end p-4">
            <p className="text-caption text-orange-400 font-bold uppercase tracking-wider">Operations Hub</p>
            <p className="text-white text-xs font-bold mt-0.5">Automated Warehouse JFK Center</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LifeAtDelcargo() {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-black text-white px-6 sm:px-12 py-10 sm:py-16">
      {/* A strip of the brand orange along the top, like the hazard stripe on a loading dock. */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-2 bg-brand" />
      <div className="text-center space-y-2">
        <h3 className="font-display text-3xl sm:text-6xl font-black uppercase tracking-tight">Life at DelCargo</h3>
        <p className="text-caption sm:text-xs font-bold uppercase tracking-widest text-brand">Perks & Compensation</p>
      </div>
      <div className="mt-10 sm:mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-8 text-left">
        {PERKS.map((p, i) => {
          const PerkIcon = PERK_ICONS[i];
          return (
            <div key={p.title} className="space-y-3 border-t-4 border-orange-600 pt-5">
              <PerkIcon weight="duotone" className="h-7 w-7 text-brand" aria-hidden="true" />
              <h4 className="font-display font-bold text-sm uppercase tracking-wider">{p.title}</h4>
              <p className="text-sm text-white/70 leading-relaxed">{p.text}</p>
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
