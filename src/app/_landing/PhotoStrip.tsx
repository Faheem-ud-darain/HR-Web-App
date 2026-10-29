import React from 'react';

// Six different crops of the one warehouse photo, as equal portrait cards in a zig-zag (every second one sits lower)
// in a window that shows five at a time and slides one card per step (still for reduced motion). The strip is decorative; the photo's description is in the Who We Are section.
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
    <div aria-hidden="true" className="mx-auto max-w-6xl px-4 sm:px-8">
     <div className="landing-strip overflow-hidden">
      <div className="landing-strip-track flex w-max items-start">
        {loop.map((c, i) => (
          <div
            key={i}
            className={`landing-strip-card aspect-4/5 shrink-0 rounded-2xl border border-white/10 bg-no-repeat ${i % 2 ? 'mt-8 sm:mt-14' : ''}`}
            style={{ backgroundImage: `url(${src})`, backgroundSize: c.zoom, backgroundPosition: c.pos }}
          />
        ))}
      </div>
     </div>
    </div>
  );
}
