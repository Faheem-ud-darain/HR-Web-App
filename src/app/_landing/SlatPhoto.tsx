import React from 'react';

// How tall each slat is, as a share of the full height: uneven on purpose, like loading-dock doors rolled up part way.
const HEIGHTS = [100, 84, 94, 70, 88, 76];
const GAP = '0.5rem';

// The warehouse photo cut into vertical slats that roll open one after another (the motion is in globals.css, "Landing
// page motion"). Each slat shows its own slice of the one picture, so together they read as a single image.
export function SlatPhoto({ src, alt, caption, place }: { src: string; alt: string; caption: string; place: string }) {
  const n = HEIGHTS.length;
  return (
    <figure>
      <div role="img" aria-label={alt} className="flex items-start h-[20rem] sm:h-[28rem] lg:h-[min(33rem,66vh)]" style={{ gap: GAP }}>
        {HEIGHTS.map((h, i) => (
          <div
            key={i}
            aria-hidden="true"
            className="landing-slat relative flex-1 overflow-hidden rounded-b-full bg-slate-900"
            style={{ '--i': i, height: `${h}%` } as React.CSSProperties}
          >
            {/* The whole picture, as wide as all the slats together, shifted so this slat shows its own slice. */}
            <img
              src={src}
              alt=""
              fetchPriority="high"
              decoding="async"
              className="absolute top-0 max-w-none object-cover"
              style={{ width: `calc(${n} * 100% + ${n - 1} * ${GAP})`, height: `${10000 / h}%`, left: `calc(${i} * (-100% - ${GAP}))` }}
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-4 text-black">
        <p className="text-caption font-bold uppercase tracking-wider">{caption}</p>
        <p className="text-sm font-bold">{place}</p>
      </figcaption>
    </figure>
  );
}
