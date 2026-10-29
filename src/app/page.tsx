'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CareersView } from '@/components/ui/CareersView';
import { ButtonLink } from '@/components/ui/Button';
import { ArrowDownIcon as ArrowDown, ArrowRightIcon as ArrowRight } from '@/components/ui/icons';
import { CAREERS_HERO, DEPARTMENTS } from '@/components/ui/careers/careerOptions';
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
    <div className="min-h-screen bg-black flex flex-col font-sans">
      {/* The hero: the warehouse, full bleed, drifting under a grid and an orange glow. The nav floats over it as a glass
          pill. pt-safe keeps it clear of the status bar on notched phones (layout.tsx draws the WebView under it). */}
      <section className="relative isolate overflow-hidden min-h-svh flex flex-col text-white">
        <img src="/delcargo_warehouse_hightech.webp" alt="High Tech Warehouse" fetchPriority="high" className="landing-hero-photo absolute inset-0 -z-30 h-full w-full object-cover" />
        <div aria-hidden="true" className="absolute inset-0 -z-20 bg-gradient-to-b from-black/70 via-black/45 to-black" />
        <div aria-hidden="true" className="landing-glow absolute inset-0 -z-10" />
        <div aria-hidden="true" className="landing-grid absolute inset-0 -z-10" />

        <header className="pt-safe px-3 sm:px-8 pt-3 sm:pt-5">
          <div className="landing-glass mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-full py-2 pl-5 pr-2">
            <div className="flex items-center gap-3 min-w-0">
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand shadow-[0_0_14px_var(--primary)]" />
              <div className="font-display font-black text-base sm:text-lg tracking-tight leading-none truncate">DelCargo <span className="hidden sm:inline">Logistics</span></div>
              <span className="hidden md:inline-block text-caption font-bold border border-white/25 px-2.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 text-white/80">Careers Portal</span>
            </div>
            <ButtonLink href="/auth" variant="primary" size="md" className="shrink-0 rounded-full">
              <span className="hidden sm:inline">Sign In to Employee Portal</span><span className="sm:hidden">Sign In</span> <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
            </ButtonLink>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-end gap-8 px-4 sm:px-8 pb-10 sm:pb-16 pt-16">
          <h1 className="font-display font-black uppercase [font-size:clamp(3rem,9.5vw,8.5rem)] leading-[0.88] tracking-[-0.045em] text-balance break-words">
            Work with <span className="landing-text-glow">DelCargo</span>
          </h1>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-6 max-w-xl">
              <p className="text-base sm:text-lg leading-relaxed text-white/75">{CAREERS_HERO.text}</p>
              <ButtonLink href="#open-positions" variant="primary" size="lg" className="rounded-full">
                Open Positions <ArrowDown className="ml-2 h-4 w-4" aria-hidden="true" />
              </ButtonLink>
            </div>
            <figure className="landing-glass rounded-3xl px-5 py-4 lg:w-72 shrink-0">
              <figcaption className="flex items-start gap-3">
                <span aria-hidden="true" className="relative mt-1.5 flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-60 motion-reduce:hidden" />
                  <span className="relative h-2.5 w-2.5 rounded-full bg-brand" />
                </span>
                <span>
                  <span className="block text-caption font-bold uppercase tracking-widest text-brand">Operations Hub</span>
                  <span className="mt-0.5 block text-sm font-semibold">Automated Warehouse JFK Center</span>
                </span>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <RoleTicker items={['Open Positions', ...DEPARTMENTS]} href="#open-positions" />

      {/* Open positions and Who We Are sit on a light sheet that rises over the dark page; Life at DelCargo closes it in
          the dark again (the careers view; its own opening words are the hero above). */}
      <main id="open-positions" className="flex-1 scroll-mt-4 w-full min-w-0 bg-slate-50 rounded-t-[2rem] sm:rounded-t-[3rem] -mt-px">
        <div className="py-10 sm:py-20 px-4 sm:px-12 max-w-6xl mx-auto">
          <CareersView role="public" hero={false} />
        </div>
      </main>

      {/* Footer */}
      <footer className="min-h-14 py-3 px-4 border-t border-white/10 bg-black flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-caption font-semibold text-white/50">
        <span>© {new Date().getFullYear()} DelCargo Operations Team. All rights reserved.</span>
        <span className="text-white/25">•</span>
        <Link href="/privacy" className="hover:text-brand transition-colors">Privacy Policy</Link>
        <span className="text-white/25">•</span>
        <Link href="/support" className="hover:text-brand transition-colors">Support</Link>
      </footer>
    </div>
  );
}
