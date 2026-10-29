import React from 'react';
import Link from 'next/link';
import { ArrowDownRightIcon as ArrowDownRight, ArrowRightIcon as ArrowRight } from '@/components/ui/icons';
import { CAREERS_HERO } from '@/components/ui/careers/careerOptions';

// The closing panel, in the brand orange whatever the theme: the opening line again with an arrow, two doors out (the
// page's sections, the employee portal), then the name across the full width and the small print.
const BTN = 'inline-flex items-center justify-center rounded-xl bg-black px-5 min-h-11 text-sm font-bold text-white hover:bg-black/80 transition-colors';

// The page's own sections, so a long scroll is never far from where you want to be.
const LINKS = [
  { href: '#who-we-are', label: 'Who We Are' },
  { href: '#life-at-delcargo', label: 'Life at DelCargo' },
  { href: '#open-positions', label: 'Open Positions' },
];

export function LandingFooter() {
  return (
    <footer className="bg-paper pt-12 sm:pt-20">
      <div className="mx-auto max-w-[96rem] px-2 sm:px-4">
        {/* A tab on the panel's top-left, like a folder. */}
        <div aria-hidden="true" className="h-6 sm:h-10 w-1/2 sm:w-1/3 rounded-t-[1.5rem] sm:rounded-t-[2.5rem] bg-brand" />
        <div className="bg-brand text-black rounded-b-[1.5rem] sm:rounded-b-[2.5rem] rounded-tr-[1.5rem] sm:rounded-tr-[2.5rem] px-5 sm:px-10 pt-8 sm:pt-12 pb-5 sm:pb-8">
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr_1fr]">
            <div className="flex items-start gap-4 lg:self-center">
              <h2 className="font-display font-black text-balance [font-size:clamp(2.25rem,4.4vw,4.25rem)] leading-[0.95] tracking-[-0.035em]">{CAREERS_HERO.title}</h2>
              <a href="#open-positions" aria-label="Open Positions" className="mt-2 sm:mt-4 shrink-0 rounded-lg border border-black/60 p-2 hover:bg-black hover:text-brand transition-colors">
                <ArrowDownRight className="h-6 w-6 sm:h-8 sm:w-8" aria-hidden="true" />
              </a>
            </div>
            <div className="rounded-2xl border border-black/40 p-5 sm:p-8 space-y-4">
              <h3 className="font-display font-black text-xl sm:text-2xl leading-tight text-center">Useful Links</h3>
              <ul className="space-y-2">
                {LINKS.map(l => (
                  <li key={l.href}>
                    <a href={l.href} className="group flex items-center justify-between gap-3 border-b border-black/25 pb-2 text-sm sm:text-base font-bold hover:border-black transition-colors">
                      {l.label}
                      <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-black/40 p-5 sm:p-8 text-center space-y-5 flex flex-col justify-center items-center">
              <h3 className="font-display font-black text-xl sm:text-2xl leading-tight">Employee Portal</h3>
              <Link href="/auth" className={BTN}>Sign In</Link>
            </div>
          </div>

          <p className="mt-8 sm:mt-12 font-display font-black text-lg sm:text-2xl">Global Freight & Software</p>

          {/* The name, stretched to the full width of the panel whatever its size. */}
          <svg viewBox="0 0 1000 150" role="img" aria-label="DelCargo" className="mt-3 sm:mt-5 w-full h-auto">
            <text x="0" y="132" textLength="1000" lengthAdjust="spacingAndGlyphs" className="fill-current font-display font-black uppercase" style={{ fontSize: 168 }}>DelCargo</text>
          </svg>

          <div className="mt-4 sm:mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-black/50 pt-4 text-caption sm:text-xs font-bold uppercase tracking-wider">
            <span>© {new Date().getFullYear()} DelCargo Operations Team. All rights reserved.</span>
            <span className="flex gap-5">
              <Link href="/privacy" className="hover:underline underline-offset-4">Privacy Policy</Link>
              <Link href="/support" className="hover:underline underline-offset-4">Support</Link>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
