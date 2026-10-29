'use client';

import React, { useState } from 'react';
import { isLongText } from '@/lib/core/announcements';

// A paragraph cut to a few lines with "Read more" when it is long, so a list of them stays scannable.
export function ExpandableText({ text, className = '' }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const long = isLongText(text);
  return (
    <div>
      <p className={`whitespace-pre-wrap break-words ${long && !open ? 'line-clamp-3' : ''} ${className}`}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="mt-1 text-xs font-semibold text-orange-600 hover:text-orange-700">
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}
