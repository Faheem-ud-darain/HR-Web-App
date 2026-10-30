'use client';

import React from 'react';
import { PaperclipIcon as Paperclip, FileTextIcon as FileText, XIcon as X, PaperPlaneRightIcon as Send, CircleNotchIcon as Loader2 } from '@/components/ui/icons';
import { IconButton } from '@/components/ui/IconButton';
import { isNativeMobileApp } from '@/lib/trackerSetup';

// Pieces shared by the chat and ticket message boxes.

/** The strip under a thread that holds the message box (keeps clear of the phone's home bar). */
export const COMPOSER_BAR = 'border-t border-slate-200 bg-white px-3 md:px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-[calc(1rem+env(safe-area-inset-bottom))]';

/** The rounded field around the text box, so chat and tickets look the same. */
export const COMPOSER_FIELD = 'flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-3xl focus-within:border-orange-300 transition-colors';

/** The text box itself: 14px, at least as large as the messages above it. */
export const COMPOSER_TEXT = 'flex-1 w-full bg-transparent py-2.5 px-3 text-sm outline-none text-slate-900 placeholder:text-slate-500 resize-none min-h-10';

/** Enter sends on a desktop keyboard (Shift+Enter makes a new line). On the phone app Enter always makes a
 *  new line, because a phone keyboard has no Shift key to combine it with. */
export const enterSends = (e: React.KeyboardEvent): boolean => e.key === 'Enter' && !e.shiftKey && !isNativeMobileApp();

export function AttachButton({ inputRef, onPick, accept, title = 'Attach a file', className = '' }: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (file: File | undefined) => void;
  accept?: string;
  title?: string;
  /** Extra classes for the button (the picker itself stays in the page either way, so another control can open it). */
  className?: string;
}) {
  return (
    <>
      <IconButton label={title} size="composer" tone="soft" className={className} onClick={() => inputRef.current?.click()}><Paperclip className="h-4 w-4" /></IconButton>
      <input ref={inputRef} type="file" accept={accept} tabIndex={-1} className="hidden" onChange={e => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
    </>
  );
}

export function SendButton({ disabled, busy, onClick, className = '', tone = 'primary' }: {
  disabled: boolean;
  busy?: boolean;
  /** Leave out inside a <form>: the button then submits it. */
  onClick?: () => void;
  className?: string;
  /** primary = orange; warning = amber, for a message sent as an announcement. */
  tone?: 'primary' | 'warning';
}) {
  return (
    <IconButton label="Send" size="composer" tone={tone} type={onClick ? 'button' : 'submit'} onClick={onClick} disabled={disabled} className={`${className}`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
    </IconButton>
  );
}

/** The file picked but not yet sent, with a remove button. */
export function PendingFileChip({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-caption font-semibold text-slate-600">
      <span className="flex items-center gap-1.5 truncate"><FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" /> {name}</span>
      <IconButton size="sm" label="Remove attachment" className="shrink-0 hover:text-rose-600" onClick={onRemove}><X className="h-3.5 w-3.5" /></IconButton>
    </div>
  );
}

/** The pop-up above the message box that offers people (@) or documents (#). The highlighted row is the one
 *  Enter or Tab picks; the arrow keys move it (the message box drives that, so focus never leaves the text). */
export function SuggestionList<T extends { id: string }>({ id, label, items, active, onPick, widthClass, activeClass, hoverClass, children }: {
  id: string;
  label: string;
  items: T[];
  active: number;
  onPick: (item: T) => void;
  widthClass: string;
  activeClass: string;
  hoverClass: string;
  children: (item: T) => React.ReactNode;
}) {
  return (
    <div id={id} role="listbox" aria-label={label} className={`absolute bottom-full left-3 mb-1 ${widthClass} bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-10`}>
      {items.map((item, i) => (
        <button
          key={item.id}
          id={`${id}-${i}`}
          type="button"
          role="option"
          aria-selected={i === active}
          tabIndex={-1}
          onMouseDown={e => { e.preventDefault(); onPick(item); }}
          className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${hoverClass} ${i === active ? activeClass : ''}`}
        >
          {children(item)}
        </button>
      ))}
    </div>
  );
}
