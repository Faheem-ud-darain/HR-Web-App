import React from 'react';

// A band of the departments hiring, scrolling past as outlined type (paused under the pointer, still for reduced motion).
// The whole band jumps to the open positions. The list is repeated so the loop has no seam.
export function RoleTicker({ items, href }: { items: string[]; href: string }) {
  const loop = [...items, ...items];
  return (
    <a href={href} aria-label={items.join(', ')} className="landing-marquee block overflow-hidden border-y border-white/10 bg-black py-5 sm:py-7">
      <div aria-hidden="true" className="landing-marquee-track flex w-max items-center gap-10 sm:gap-20 pr-10 sm:pr-20">
        {loop.map((item, i) => (
          <span key={i} className="font-display text-4xl sm:text-7xl font-black uppercase tracking-tight whitespace-nowrap text-transparent [-webkit-text-stroke:1px_rgb(255_255_255_/_0.35)] hover:[-webkit-text-stroke-color:var(--primary)] transition-colors">{item}</span>
        ))}
      </div>
    </a>
  );
}
