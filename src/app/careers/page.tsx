'use client';

import React from 'react';
import { CareersView } from '@/components/ui/CareersView';
import Link from 'next/link';

export default function PublicCareersPage() {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-slate-50/50 flex flex-col font-sans">
      {/* Mini public header. min-h-16 + pt-safe, not h-16 — see the same
          fix + explanation in src/app/page.tsx's header. */}
      <header className="min-h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sm:px-12 sticky top-0 z-50 pt-safe">
        <div className="flex items-center gap-2">
          <div className="font-bold text-lg text-orange-600 tracking-tight">DelCargo Logistics</div>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Careers</span>
        </div>
        <Link 
          href="/auth"
          className="text-xs font-bold text-slate-600 hover:text-orange-600 transition-colors"
        >
          Employee Portal Login →
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-12 px-6 sm:px-12 max-w-5xl mx-auto w-full min-w-0 overflow-x-hidden">
        <CareersView role="public" />
      </main>

      {/* Dedicated Career Footer */}
      <footer className="border-t border-slate-200 bg-white py-12 px-6 sm:px-12">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-xs font-semibold text-slate-500">
          {/* Column 1: Work Timings */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest text-orange-600">Work Timings</h4>
            <div className="space-y-1 text-slate-500 font-medium leading-relaxed">
              <p>⏱️ USA Operations: 9:00 AM - 5:00 PM EST</p>
              <p>⏱️ Remote PK Team: 12:00 PM - 9:00 PM PKT</p>
              <p className="text-[10px] text-slate-400 mt-1.5">Mon - Fri (Saturday/Sunday Off)</p>
            </div>
          </div>

          {/* Column 2: Newsletter Subscription */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest text-orange-600">Career Alerts</h4>
            <p className="text-slate-500 font-medium leading-relaxed">Subscribe to get notifications about new job openings at DelCargo.</p>
            <form onSubmit={(e) => { e.preventDefault(); alert('Subscribed to career alerts!'); }} className="flex gap-2">
              <input 
                type="email" 
                required 
                placeholder="Enter email..." 
                className="bg-slate-50 border border-slate-200 focus:border-orange-500 outline-none rounded-lg px-2.5 py-1.5 text-[11px] font-medium flex-1 text-slate-800"
              />
              <button 
                type="submit" 
                className="bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-3 py-1.5 text-[11px] font-bold active:scale-97 transition-colors transition-transform shrink-0"
              >
                Subscribe
              </button>
            </form>
          </div>

          {/* Column 3: Quicklinks */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest text-orange-600">Quick Links</h4>
            <div className="grid grid-cols-2 gap-2 text-slate-500 font-medium">
              <Link href="/auth" className="hover:text-orange-600 transition-colors">Employee Portal</Link>
              <Link href="/careers" className="hover:text-orange-600 transition-colors">Open Roles</Link>
              <span className="hover:text-orange-600 transition-colors cursor-pointer" onClick={() => alert('Corporate Policies')}>Policies</span>
              <span className="hover:text-orange-600 transition-colors cursor-pointer" onClick={() => alert('Privacy Agreement')}>Privacy</span>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto border-t border-slate-100 mt-10 pt-6 text-center text-[10px] text-slate-400 font-bold">
          © {new Date().getFullYear()} DelCargo Operations Team. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
