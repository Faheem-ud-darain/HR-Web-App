'use client';

import React from 'react';
import { DownloadSimpleIcon as Download, FileTextIcon as FileText } from '@/components/ui/icons';
import { ViewerButton, ViewerOverlay } from '@/components/ui/ViewerOverlay';

interface DocumentPreviewModalProps {
  url: string | null;
  name: string;
  onClose: () => void;
}

// A PDF or an image document (a CV, an ID scan) opened full size from the HR review screens.
export function DocumentPreviewModal({ url, name, onClose }: DocumentPreviewModalProps) {
  if (!url) return null;
  const isImage = !(name.toLowerCase().endsWith('.pdf') || url.startsWith('data:application/pdf')) && (/\.(png|jpe?g|gif|webp)$/i.test(name) || url.startsWith('data:image/'));

  return (
    <ViewerOverlay
      label={name}
      onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />{name}</span>}
      actions={<ViewerButton label="Download" href={url} download={name}><Download className="h-4 w-4" aria-hidden="true" /></ViewerButton>}
    >
      <div className="flex h-full w-full max-w-4xl items-center justify-center overflow-hidden rounded-xl bg-slate-950 shadow-2xl">
        {isImage
          ? <img src={url} alt={name} className="max-h-full max-w-full object-contain p-2" />
          : <iframe src={url} title={name} className="h-full w-full border-none" />}
      </div>
    </ViewerOverlay>
  );
}
