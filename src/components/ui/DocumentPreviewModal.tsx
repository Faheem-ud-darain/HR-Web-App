'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, FileText } from 'lucide-react';
import { pushModal, popModal } from '@/lib/modalStack';

interface DocumentPreviewModalProps {
  url: string | null;
  name: string;
  onClose: () => void;
}

export function DocumentPreviewModal({ url, name, onClose }: DocumentPreviewModalProps) {
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [url, onClose]);

  useEffect(() => {
    if (url) {
      pushModal();
      return () => popModal();
    }
  }, [url]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!url || !mounted || typeof document === 'undefined') return null;

  const isPdf = name.toLowerCase().endsWith('.pdf') || url.startsWith('data:application/pdf');
  const isImage = /\.(png|jpe?g|gif|webp)$/i.test(name) || url.startsWith('data:image/');

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 fade-enter"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2" onClick={e => e.stopPropagation()}>
        <a
          href={url}
          download={name}
          className="h-9 w-9 rounded-full bg-black/40 backdrop-blur-md hover:bg-black/55 text-white flex items-center justify-center transition-colors"
          title="Download"
        >
          <Download className="h-4 w-4" />
        </a>
        <button
          onClick={onClose}
          className="h-9 w-9 rounded-full bg-black/40 backdrop-blur-md hover:bg-black/55 text-white flex items-center justify-center transition-colors"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative z-0 w-full max-w-4xl max-h-[90vh] h-[85vh] bg-slate-900 rounded-xl overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 bg-slate-800 text-white font-bold text-sm flex items-center gap-2 border-b border-slate-700">
          <FileText className="h-4 w-4 text-orange-500 shrink-0" />
          <span className="truncate">{name}</span>
        </div>
        <div className="flex-1 w-full h-full overflow-hidden bg-slate-950 flex items-center justify-center">
          {isPdf ? (
            <iframe
              src={url}
              title={name}
              className="w-full h-full border-none"
            />
          ) : isImage ? (
            <img
              src={url}
              alt={name}
              className="max-h-full max-w-full object-contain p-2"
            />
          ) : (
            <iframe
              src={url}
              title={name}
              className="w-full h-full border-none"
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
