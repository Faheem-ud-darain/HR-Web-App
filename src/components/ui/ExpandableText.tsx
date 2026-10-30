'use client';

import { Button } from '@/components/ui/Button';
import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { isLongText, previewText } from '@/lib/core/announcements';

// A paragraph cut to a fixed length with an inline "Read more" that opens the whole text in a popup, so a list or a stack of
// cards keeps an even height however long one of them is.
export function ExpandableText({ text, title, className = '' }: { text: string; title: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const long = isLongText(text);
  return (
    <>
      <p className={`whitespace-pre-wrap break-words ${className}`}>
        {previewText(text)}
        {long && <Button type="button" variant="ghost" size="xs" onClick={() => setOpen(true)} className="ml-1 px-1 py-0 text-orange-600!">Read more</Button>}
      </p>
      {long && (
        <Modal isOpen={open} onClose={() => setOpen(false)} title={title}>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{text}</p>
        </Modal>
      )}
    </>
  );
}
