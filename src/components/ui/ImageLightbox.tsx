'use client';

import React from 'react';
import { DownloadSimpleIcon as Download } from '@/components/ui/icons';
import { ViewerButton, ViewerOverlay } from '@/components/ui/ViewerOverlay';

interface ImageLightboxProps {
  src: string | null;
  alt?: string;
  downloadName?: string;
  onClose: () => void;
}

// Full-size image viewer used for profile pictures (HR/Admin "view full size" on an employee's photo) and for ticket
// attachment images. An in-app overlay rather than <a target="_blank"> on a base64 data: URL, which Capacitor/Android
// WebViews hand off to an external browser intent and fail on.
export function ImageLightbox({ src, alt, downloadName, onClose }: ImageLightboxProps) {
  if (!src) return null;
  return (
    <ViewerOverlay
      label={alt || 'Image preview'}
      onClose={onClose}
      actions={<ViewerButton label="Download image" href={src} download={downloadName || 'image'}><Download className="h-4 w-4" aria-hidden="true" /></ViewerButton>}
    >
      <img src={src} alt={alt || 'Image'} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
    </ViewerOverlay>
  );
}
