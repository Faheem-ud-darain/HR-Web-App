import React from 'react';

// Five different crops of the one warehouse photo, as rounded cards of staggered heights and offsets drifting past (still for reduced
// motion). The strip is decorative; the photo's description is in the Who We Are section further down.
const CARDS = [
  { h: 'h-44 sm:h-52 mt-10 sm:mt-16', pos: '8% 30%', zoom: '260%' },
  { h: 'h-52 sm:h-72 mt-0', pos: '48% 55%', zoom: '210%' },
  { h: 'h-48 sm:h-60 mt-6 sm:mt-10', pos: '92% 25%', zoom: '300%' },
  { h: 'h-52 sm:h-80 mt-0', pos: '30% 80%', zoom: '240%' },
  { h: 'h-44 sm:h-56 mt-12 sm:mt-20', pos: '70% 60%', zoom: '280%' },
];

export function PhotoStrip({ src }: { src: string }) {
  const loop = [...CARDS, ...CARDS];
  return (
    <div aria-hidden="true" className="landing-marquee overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]">
      <div className="landing-marquee-track flex w-max items-start gap-3 sm:gap-5 pr-3 sm:pr-5">
        {loop.map((c, i) => (
          <div
            key={i}
            className={`${c.h} w-36 sm:w-60 shrink-0 rounded-2xl border border-white/10 bg-no-repeat`}
            style={{ backgroundImage: `url(${src})`, backgroundSize: c.zoom, backgroundPosition: c.pos }}
          />
        ))}
      </div>
    </div>
  );
}
