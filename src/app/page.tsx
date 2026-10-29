'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CareersView } from '@/components/ui/CareersView';
import { ButtonLink } from '@/components/ui/Button';
import { ArrowDownIcon as ArrowDown, ArrowRightIcon as ArrowRight } from '@/components/ui/icons';
import { CAREERS_HERO, DEPARTMENTS } from '@/components/ui/careers/careerOptions';
import { SlatPhoto } from './_landing/SlatPhoto';
import { RoleTicker } from './_landing/RoleTicker';
import Link from 'next/link';
import {
  getSessionEmail,
  getSessionRole,
  hydrateSessionFromNativeStorage,
  isValidRole,
  dashboardSectionForRole,
  clearSession,
} from '@/lib/session';
import { PageLoader } from '@/components/ui/Spinner';

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
      <PageLoader />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* min-h-16 + pt-safe (not h-16) is deliberate: on notched / Dynamic-Island iPhones the WebView draws full-screen
          under the status bar (see layout.tsx's viewportFit: 'cover'), so a fixed h-16 with no top padding put the
          wordmark and "Sign In" under the status bar, unreadable and untappable. pt-safe (globals.css) adds
          env(safe-area-inset-top) of padding above the content instead. */}
      <header className="sticky top-0 z-50 min-h-16 bg-brand text-black flex items-center justify-between px-4 sm:px-12 min-w-0 pt-safe">
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="font-display font-black text-lg sm:text-xl tracking-tight leading-none truncate">DelCargo <span className="hidden sm:inline">Logistics</span></div>
          <span className="hidden sm:inline-block text-caption font-bold border-2 border-black px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">Careers Portal</span>
        </div>
        <ButtonLink href="/auth" variant="ink" size="md" className="shrink-0">
          <span className="hidden sm:inline">Sign In to Employee Portal</span><span className="sm:inline md:hidden">Sign In</span> <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
        </ButtonLink>
      </header>

      {/* The hero: the brand orange from edge to edge, one huge line of type and the warehouse seen through slats. */}
      <section className="bg-brand text-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-12 pt-8 sm:pt-14 pb-12 sm:pb-20 grid lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-8 items-end">
          <div className="space-y-6 sm:space-y-8 lg:pb-6">
            <h1 className="font-display font-black uppercase [font-size:clamp(3rem,8.4vw,7.2rem)] leading-[0.9] tracking-[-0.04em] text-balance break-words">
              {CAREERS_HERO.title}
            </h1>
            <p className="max-w-lg text-base sm:text-lg font-medium leading-relaxed text-black/80">
              {CAREERS_HERO.text}
            </p>
            <ButtonLink href="#open-positions" variant="ink" size="lg">
              Open Positions <ArrowDown className="ml-2 h-4 w-4" aria-hidden="true" />
            </ButtonLink>
          </div>
          <SlatPhoto src="/delcargo_warehouse_hightech.webp" alt="High Tech Warehouse" caption="Operations Hub" place="Automated Warehouse JFK Center" />
        </div>
      </section>

      <RoleTicker items={['Open Positions', ...DEPARTMENTS]} href="#open-positions" />

      {/* Open positions, Who We Are and Life at DelCargo (the careers view; its own opening words are the hero above). */}
      <main id="open-positions" className="flex-1 scroll-mt-16 py-10 sm:py-20 px-4 sm:px-12 max-w-6xl mx-auto w-full min-w-0">
        <CareersView role="public" hero={false} />
      </main>

      {/* Footer */}
      <footer className="h-14 border-t border-slate-200 bg-white flex items-center justify-center gap-3 text-caption font-semibold text-slate-400">
        <span>© {new Date().getFullYear()} DelCargo Operations Team. All rights reserved.</span>
        <span className="text-slate-300">•</span>
        <Link href="/privacy" className="hover:text-orange-600 transition-colors">Privacy Policy</Link>
        <span className="text-slate-300">•</span>
        <Link href="/support" className="hover:text-orange-600 transition-colors">Support</Link>
      </footer>
    </div>
  );
}
