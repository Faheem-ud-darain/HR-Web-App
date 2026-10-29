import React from 'react';

// Six different crops of the one warehouse photo, as equal portrait cards in a zig-zag (every second one sits lower)
// edge to edge, five across at any screen size, moving steadily (still for reduced motion). The strip is decorative; the photo's description is in the Who We Are section.
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
    <div aria-hidden="true" className="landing-strip overflow-hidden">
      <div className="landing-strip-track flex w-max items-start">
        {loop.map((c, i) => (
          <div
            key={i}
            data-low={i % 2 ? '' : undefined}
            className="landing-strip-card aspect-5/6 shrink-0 rounded-2xl border border-white/10 bg-no-repeat"
            style={{ backgroundImage: `url(${src})`, backgroundSize: c.zoom, backgroundPosition: c.pos }}
          />
        ))}
      </div>
    </div>
  );
}
