import React from 'react';

// Five different crops of the one warehouse photo, as equal portrait cards in a zig-zag (every second one sits lower)
// drifting past, still for reduced motion. The strip is decorative; the photo's description is in the Who We Are section.
const CROPS = [
  { pos: '8% 30%', zoom: '260%' },
  { pos: '48% 55%', zoom: '210%' },
  { pos: '92% 25%', zoom: '300%' },
  { pos: '30% 80%', zoom: '240%' },
  { pos: '70% 60%', zoom: '280%' },
  { pos: '15% 70%', zoom: '230%' },
]; // an even count, so the zig-zag stays unbroken where the loop repeats

export function PhotoStrip({ src }: { src: string }) {
  const loop = [...CROPS, ...CROPS];
  return (
    <div aria-hidden="true" className="landing-marquee overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]">
      <div className="landing-marquee-track flex w-max items-start gap-3 sm:gap-4 pr-3 sm:pr-4">
        {loop.map((c, i) => (
          <div
            key={i}
            className={`aspect-4/5 w-36 sm:w-60 shrink-0 rounded-2xl border border-white/10 bg-no-repeat ${i % 2 ? 'mt-8 sm:mt-14' : ''}`}
            style={{ backgroundImage: `url(${src})`, backgroundSize: c.zoom, backgroundPosition: c.pos }}
          />
        ))}
      </div>
    </div>
  );
}
