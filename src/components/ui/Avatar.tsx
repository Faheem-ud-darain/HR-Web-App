'use client';

import React from 'react';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: number; // px
  className?: string;
}

// Bulletproof circular avatar. Deliberately uses inline styles (not just
// Tailwind's rounded-full/object-cover utility classes) for the box shape
// and clipping — a fixed-size wrapper with overflow:hidden + border-radius
// guarantees a perfect circle regardless of the source image's aspect
// ratio, and doesn't depend on any Tailwind class actually being present
// in the generated stylesheet at the sizes used here.
export function Avatar({ src, name, size = 40, className = '' }: AvatarProps) {
  const [imgError, setImgError] = React.useState(false);

  const initials = name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  const wrapperStyle: React.CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    borderRadius: '9999px',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: '1px solid var(--border)',
  };

  return (
    <div className={`${className} ${src && !imgError ? '' : 'bg-orange-50'}`} style={wrapperStyle}>
      {src && !imgError ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
        />
      ) : (
        <span className="font-bold text-orange-600" style={{ fontSize: Math.max(11, size * 0.36) }}>{initials}</span>
      )}
    </div>
  );
}
