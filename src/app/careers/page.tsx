'use client';

import React from 'react';
import { CareersView } from '@/components/ui/CareersView';
import { PublicPage } from '@/components/landing/PublicPage';
import { CAREERS_HERO } from '@/components/ui/careers/careerOptions';

export default function PublicCareersPage() {
  return (
    <PublicPage badge="Careers">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-8 pt-14 sm:pt-24 space-y-20 sm:space-y-32">
        <header className="max-w-3xl space-y-4">
          <h1 className="font-display font-black text-balance text-4xl sm:text-7xl leading-[0.95] tracking-[-0.03em] text-ink">{CAREERS_HERO.title}</h1>
          <p className="text-base sm:text-lg text-ink/70 leading-relaxed">{CAREERS_HERO.text}</p>
        </header>
        <CareersView role="public" hero={false} />
      </div>
    </PublicPage>
  );
}
