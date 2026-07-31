'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CareersView } from '@/components/ui/CareersView';
import Link from 'next/link';
import {
  getSessionEmail,
  getSessionRole,
  hydrateSessionFromNativeStorage,
  isValidRole,
  dashboardSectionForRole,
  clearSession,
} from '@/lib/session';

export default function Home() {
  const router = useRouter();
  // On a Capacitor cold start (app fully killed, not just backgrounded),
  // the WebView always reloads at "/" first — this page — regardless of
  // where the user was before closing the app. Previously this page never
  // looked at the session at all, so a logged-in user landed back on the
  // public Careers page and had to sign in again even though their session
  // token was still valid in storage; that's what read as "logged out on
  // restart." This check runs once at boot and, if a valid session is
  // found, redirects straight into the dashboard instead. `checked` gates
  // rendering the public page so there's no flash of it before the
  // redirect takes over.
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await hydrateSessionFromNativeStorage();
      if (cancelled) return;

      const savedRole = getSessionRole();
      const savedEmail = getSessionEmail();

      if (savedRole && savedEmail) {
        if (isValidRole(savedRole)) {
          router.replace(`/${dashboardSectionForRole(savedRole)}`);
          return; // stay on the loading state — navigation is taking over
        }
        // Unknown/corrupted role value — don't route somewhere that may
        // not exist. Clear it and fall through to the public page.
        clearSession();
      }
      if (!cancelled) setChecked(true);
    })();
    return () => { cancelled = true; };
  }, [router]);

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <svg className="animate-spin h-8 w-8 text-orange-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

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
