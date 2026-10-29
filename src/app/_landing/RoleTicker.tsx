import React from 'react';

// A band of the departments hiring, scrolling past as large faint type (paused under the pointer, still for reduced motion).
// The whole band jumps to the open positions. The list is repeated so the loop has no seam.
export function RoleTicker({ items, href }: { items: string[]; href: string }) {
  const loop = [...items, ...items];
  return (
    <a href={href} aria-label={items.join(', ')} className="landing-marquee block overflow-hidden bg-paper py-5 sm:py-7">
      <div aria-hidden="true" className="landing-marquee-track flex w-max items-center gap-10 sm:gap-20 pr-10 sm:pr-20">
        {loop.map((item, i) => (
          <span key={i} className="font-display text-4xl sm:text-7xl font-black uppercase tracking-tight whitespace-nowrap text-ink/15 hover:text-brand transition-colors">{item}</span>
        ))}
      </div>
    </a>
  );
}
