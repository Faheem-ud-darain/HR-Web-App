import React from 'react';

// Five different crops of the one warehouse photo, as rounded cards of staggered heights drifting past (still for reduced
// motion). The strip is decorative; the photo's description is in the Who We Are section further down.
const CARDS = [
  { h: 'h-60 sm:h-80', pos: '8% 30%', zoom: '260%' },
  { h: 'h-72 sm:h-96', pos: '48% 55%', zoom: '210%' },
  { h: 'h-56 sm:h-72', pos: '92% 25%', zoom: '300%' },
  { h: 'h-72 sm:h-[26rem]', pos: '30% 80%', zoom: '240%' },
  { h: 'h-60 sm:h-80', pos: '70% 60%', zoom: '280%' },
];

export function PhotoStrip({ src }: { src: string }) {
  const loop = [...CARDS, ...CARDS];
  return (
    <div aria-hidden="true" className="landing-marquee overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]">
      <div className="landing-marquee-track flex w-max items-center gap-4 sm:gap-6 pr-4 sm:pr-6">
        {loop.map((c, i) => (
          <div
            key={i}
            className={`${c.h} w-44 sm:w-72 shrink-0 rounded-3xl border border-white/10 bg-no-repeat`}
            style={{ backgroundImage: `url(${src})`, backgroundSize: c.zoom, backgroundPosition: c.pos }}
          />
        ))}
      </div>
    </div>
  );
}
