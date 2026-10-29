import React from 'react';
import { LandingNav } from '@/components/landing/LandingNav';
import { LandingFooter } from '@/components/landing/LandingFooter';

// The frame every public page sits in: the landing page's nav and footer on its paper-and-ink colours (dark or light
// with the app's theme). The landing page itself uses the same nav and footer around its hero.
export function PublicPage({ badge, signIn = true, children }: { badge: string; signIn?: boolean; children: React.ReactNode }) {
  return (
    <div className="landing-root min-h-screen bg-paper text-ink flex flex-col font-sans">
      <LandingNav badge={badge} signIn={signIn} />
      <main className="flex-1 w-full min-w-0">{children}</main>
      <LandingFooter />
    </div>
  );
}

// A long text page (policy, help): a big title, a small facts line, then the sections.
export function DocPage({ badge, title, meta, children }: { badge: string; title: string; meta: React.ReactNode; children: React.ReactNode }) {
  return (
    <PublicPage badge={badge}>
      <article className="mx-auto w-full max-w-3xl px-5 sm:px-8 pt-14 sm:pt-24 text-sm text-ink/80 leading-relaxed space-y-10">
        <header className="space-y-3">
          <h1 className="font-display font-black text-balance text-4xl sm:text-6xl leading-[0.95] tracking-[-0.03em] text-ink">{title}</h1>
          <div className="text-xs text-ink/60 font-semibold space-y-1">{meta}</div>
        </header>
        {children}
      </article>
    </PublicPage>
  );
}

// One titled block of a DocPage.
export function DocSection({ title, children, className = 'space-y-2' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h2 className="font-display text-xl sm:text-2xl font-black text-ink">{title}</h2>
      {children}
    </section>
  );
}

// A boxed notice at the top of a DocPage.
export function DocNotice({ children }: { children: React.ReactNode }) {
  return <div className="bg-ink/5 text-ink/80 text-xs font-semibold p-4 rounded-2xl">{children}</div>;
}
