import React from 'react';
import { GiftIcon as Gift } from '@phosphor-icons/react/dist/ssr';

const PERKS = [
  { title: 'Good Salary', text: 'We offer competitive salaries calibrated for regional standards, with guaranteed annual increments.' },
  { title: 'Accrued PTOs', text: 'Accrue leave balance every month with cashing out settlements.' },
  { title: 'Learning & Tech', text: 'Collaborate using modern architectures, framework toolsets, and clean design structures.' },
  { title: 'Parental Leaves', text: 'Gender-balanced opportunities including fully paid Parental Leaves.' },
];

const serif = { fontFamily: 'Georgia, serif' };

// "Who We Are": company blurb, three live counts and a photo. Shown to outside candidates only.
export function CompanyIntro({ warehouseCount, teamCount, openPositions }: { warehouseCount: number; teamCount: number; openPositions: number }) {
  const stats = [
    { value: warehouseCount, label: 'Active Warehouses' },
    { value: teamCount, label: 'Departments' },
    { value: openPositions, label: 'Open Positions' },
  ];
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-12 mb-8 shadow-sm overflow-hidden font-sans">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center">
        <div className="lg:col-span-7 space-y-5 sm:space-y-6">
          <div className="space-y-2">
            <span className="inline-block text-[10px] font-bold text-orange-600 uppercase tracking-widest bg-orange-50 border border-orange-100 px-3 py-1 rounded-full">
              Global Freight & Software
            </span>
            <h3 className="text-xl sm:text-2xl font-light text-slate-900 uppercase tracking-wider mt-2" style={serif}>Who We Are</h3>
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
                <p className="text-base sm:text-lg font-bold text-slate-900">{s.value}</p>
                <p className="text-[8px] sm:text-[9px] text-slate-400 font-bold uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 relative group overflow-hidden rounded-xl border border-slate-200 shadow">
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
            <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Operations Hub</p>
            <p className="text-white text-xs font-bold mt-0.5">Automated Warehouse JFK Center</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LifeAtDelcargo() {
  return (
    <section className="bg-slate-50/50 py-8 sm:py-12 px-5 sm:px-12 border border-slate-200 rounded-xl space-y-6 sm:space-y-8">
      <div className="text-center space-y-1.5">
        <h3 className="text-lg sm:text-xl font-light text-slate-900 uppercase tracking-widest" style={serif}>Life at DelCargo</h3>
        <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider">Perks & Compensation</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 text-left">
        {PERKS.map(p => (
          <div key={p.title} className="space-y-1.5 bg-white sm:bg-transparent p-4 sm:p-0 rounded-xl border sm:border-0 border-slate-100">
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800">{p.title}</h4>
            <p className="text-xs text-slate-500 leading-relaxed font-light">{p.text}</p>
          </div>
        ))}
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
