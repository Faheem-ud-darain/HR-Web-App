'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRightIcon as ArrowRight } from '@/components/ui/icons';
import { ButtonLink } from '@/components/ui/Button';
import { ThemeIconButton } from '@/components/ui/ThemeToggle';

// The sections of the landing page; from any other public page they take you back to it.
const NAV_LINKS = [
  { href: '/#who-we-are', label: 'Who We Are' },
  { href: '/#life-at-delcargo', label: 'Life at DelCargo' },
  { href: '/#open-positions', label: 'Open Positions' },
];

// The floating pill at the top of every public page (the landing page, Privacy Policy, Support, Careers). `badge` names
// the page, `signIn` shows the Sign In button (off on the sign-in page itself); pt-safe keeps it clear of the status bar on notched phones (layout.tsx draws the WebView under it).
export function LandingNav({ badge = 'Careers Portal', signIn = true }: { badge?: string; signIn?: boolean }) {
  return (
    <header className="pt-safe px-3 sm:px-8 pt-3 sm:pt-5">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-full bg-ink py-2 pl-5 pr-2 text-paper">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="font-display font-black text-base sm:text-lg tracking-tight leading-none truncate">DelCargo <span className="hidden sm:inline">Logistics</span></Link>
          <span className="hidden md:inline-block text-caption font-bold border border-paper/25 px-2.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 text-paper/70">{badge}</span>
        </div>
        <nav aria-label="Page sections" className="hidden lg:flex items-center gap-8 text-sm font-semibold text-paper/70">
          {NAV_LINKS.map(l => <Link key={l.href} href={l.href} className="hover:text-paper transition-colors">{l.label}</Link>)}
        </nav>
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <ThemeIconButton className="text-paper/70! hover:bg-paper/15! hover:text-paper!" />
          {signIn && <ButtonLink href="/auth" variant="ink" size="md" className="shrink-0 rounded-full bg-paper! text-ink! hover:bg-paper/80!">
            <span className="hidden sm:inline">Sign In to Employee Portal</span><span className="sm:hidden">Sign In</span> <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
          </ButtonLink>}
        </div>
      </div>
    </header>
  );
}
