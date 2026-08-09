'use client';

import React, { useState } from 'react';
import Image, { ImageProps } from 'next/image';
import { getBlurPlaceholderSvg } from '@/lib/imageOptimizer';

interface OptimizedImageProps extends Omit<ImageProps, 'src'> {
  src: string;
  fallbackSrc?: string;
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  fallbackSrc = '/AppIconNoText.png',
  className = '',
  priority,
  ...props
}) => {
  const [imgSrc, setImgSrc] = useState<string>(src);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  const blurUrl = getBlurPlaceholderSvg();

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <Image
        {...props}
        src={hasError ? fallbackSrc : imgSrc}
        alt={alt || 'Image'}
        placeholder="blur"
        blurDataURL={blurUrl}
        priority={priority}
        loading={priority ? undefined : 'lazy'}
        unoptimized
        className={`transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          if (!hasError) {
            setHasError(true);
            setImgSrc(fallbackSrc);
          }
        }}
      />
      {!isLoaded && (
        <div className="absolute inset-0 bg-slate-200/70 animate-pulse" />
      )}
    </div>
  );
};
