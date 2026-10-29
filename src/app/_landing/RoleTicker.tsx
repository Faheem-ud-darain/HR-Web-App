import React from 'react';

// A band of the departments hiring, scrolling past (paused under the pointer, still for reduced motion). The whole band
// jumps to the open positions. The list is repeated so the loop has no seam.
export function RoleTicker({ items, href }: { items: string[]; href: string }) {
  const loop = [...items, ...items];
  return (
    <a href={href} aria-label={items.join(', ')} className="landing-marquee block overflow-hidden bg-black py-4 sm:py-6 text-white">
      <div aria-hidden="true" className="landing-marquee-track flex w-max items-center gap-6 sm:gap-10 pr-6 sm:pr-10">
        {loop.map((item, i) => (
          <React.Fragment key={i}>
            <span className="font-display text-2xl sm:text-5xl font-black uppercase tracking-tight whitespace-nowrap">{item}</span>
            <span className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 shrink-0 rotate-45 bg-brand" />
          </React.Fragment>
        ))}
      </div>
    </a>
  );
}
