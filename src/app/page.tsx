'use client';

import React from 'react';
import { CareersView } from '@/components/ui/CareersView';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans">
      {/* Premium Public Landing Header. min-h-16 + pt-safe (not h-16) is
          deliberate — on notched/Dynamic-Island iPhones the WebView draws
          full-screen under the status bar (see layout.tsx's
          viewportFit: 'cover'), so a fixed h-16 with no top padding put
          "DelCargo" and "Sign In" right under/behind the status bar,
          unreadable and untappable. pt-safe (globals.css) adds
          env(safe-area-inset-top) of padding above the content instead. */}
      <header className="min-h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-12 sticky top-0 z-50 shadow-sm min-w-0 pt-safe">
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="font-bold text-base sm:text-lg text-orange-600 tracking-tight leading-none truncate">DelCargo <span className="hidden sm:inline">Logistics</span></div>
          <span className="hidden sm:inline-block text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">Careers Portal</span>
        </div>
        <Link 
          href="/auth"
          className="shrink-0 text-[10px] sm:text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl transition-colors transition-transform shadow-sm shadow-orange-600/10 active:scale-97 whitespace-nowrap"
        >
          <span className="hidden sm:inline">Sign In to Employee Portal</span><span className="sm:inline md:hidden">Sign In</span> →
        </Link>
      </header>

      {/* Main Landing Content */}
      <main className="flex-1 py-8 sm:py-16 px-4 sm:px-12 max-w-5xl mx-auto w-full min-w-0">
        <CareersView role="public" />
      </main>

      {/* Footer */}
      <footer className="h-14 border-t border-slate-200 bg-white flex items-center justify-center gap-3 text-[10px] font-semibold text-slate-400">
        <span>© {new Date().getFullYear()} DelCargo Operations Team. All rights reserved.</span>
        <span className="text-slate-300">•</span>
        <Link href="/privacy" className="hover:text-orange-600 transition-colors">Privacy Policy</Link>
      </footer>
    </div>
  );
}
