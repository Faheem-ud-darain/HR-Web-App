'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CareersView } from '@/components/ui/CareersView';
import { ButtonLink } from '@/components/ui/Button';
import { ArrowDownIcon as ArrowDown } from '@/components/ui/icons';
import { CAREERS_HERO, DEPARTMENTS } from '@/components/ui/careers/careerOptions';
import { LandingNav } from '@/components/landing/LandingNav';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { PhotoStrip } from './_landing/PhotoStrip';
import { RoleTicker } from './_landing/RoleTicker';
import {
  getSessionEmail,
  getSessionRole,
  hydrateSessionFromNativeStorage,
  isValidRole,
  dashboardSectionForRole,
  clearSession,
} from '@/lib/session';
import { PageLoader } from '@/components/ui/Spinner';
import { useResolvedTheme } from '@/lib/theme';

// The hero video for each theme: the same ribbon on black, or on pale grey.
const HERO_MEDIA = {
  dark: { video: '/delcargo_hero.mp4', poster: '/delcargo_hero_poster.jpg' },
  light: { video: '/delcargo_hero_light.mp4', poster: '/delcargo_hero_light_poster.jpg' },
};


export default function Home() {
  const router = useRouter();
  const hero = HERO_MEDIA[useResolvedTheme()];
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
    <div className="landing-root min-h-screen bg-paper flex flex-col font-sans">
      {/* The hero: centred words over a looping video, then the warehouse in five crops drifting past. The nav is a white pill. pt-safe
          keeps it clear of the status bar on notched phones (layout.tsx draws the WebView under it). */}
      <section className="relative isolate overflow-hidden text-ink pb-12 sm:pb-24">
        {/* The video is the hero's backdrop; people who ask for less motion get its first frame instead. */}
        <div aria-hidden="true" className="absolute inset-0 -z-20 bg-cover bg-center" style={{ backgroundImage: `url(${hero.poster})` }}>
          <video key={hero.video} src={hero.video} poster={hero.poster} autoPlay muted loop playsInline preload="auto" className="h-full w-full object-cover motion-reduce:hidden" />
        </div>
        <div aria-hidden="true" className="landing-blur -z-10"><i /><i /><i /></div>
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-b from-paper/40 via-paper/5 via-60% to-paper" />

        <LandingNav />

        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 sm:px-8 pt-10 sm:pt-16 pb-12 sm:pb-20 text-center">
          <h1 className="font-display font-black [font-size:clamp(2.5rem,5.6vw,4.75rem)] leading-[1] tracking-[-0.03em] text-balance break-words">
            Work with <span className="text-brand">DelCargo</span>
          </h1>
          <p className="max-w-xl text-sm sm:text-base leading-relaxed text-ink/70">{CAREERS_HERO.text}</p>
          <ButtonLink href="#open-positions" variant="ink" size="md" className="rounded-full bg-ink! text-paper! hover:bg-ink/85!">
            Open Positions <ArrowDown className="ml-2 h-4 w-4" aria-hidden="true" />
          </ButtonLink>
        </div>

        <PhotoStrip src="/delcargo_warehouse_hightech.webp" />
      </section>

      <RoleTicker items={['Open Positions', ...DEPARTMENTS]} href="#open-positions" />

      {/* Who We Are, Life at DelCargo and the open positions, on the dark page (the careers view; its own opening words are
          the hero above). */}
      <main className="flex-1 w-full min-w-0 bg-paper text-ink">
        <div className="py-16 sm:py-28 px-4 sm:px-8 max-w-6xl mx-auto">
          <CareersView role="public" hero={false} />
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
