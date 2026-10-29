'use client';

import React, { useRef } from 'react';
import { CheckCircleIcon as CheckCircle, FileTextIcon as FileText, UploadSimpleIcon as Upload, XIcon as X } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';

export interface UploadedFile {
  name: string;
  /** An image to show as a small round picture instead of a file icon (profile photos). */
  preview?: string;
}

// A "Choose a file" button. The picker itself is a hidden input, opened by the button, so keyboard and screen-reader
// users can use it (a display:none input inside a label cannot be reached).
export function FilePickButton({ children, accept, onPick, disabled, loading, variant = 'primary' }: {
  children: React.ReactNode;
  accept: string;
  onPick: (file: File | undefined) => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button type="button" variant={variant} size="md" loading={loading} disabled={disabled} onClick={() => input.current?.click()} className="shrink-0">
        {!loading && <Upload className="h-4 w-4" aria-hidden="true" />}{children}
      </Button>
      <input ref={input} type="file" accept={accept} tabIndex={-1} className="hidden" onChange={e => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
    </>
  );
}

// One document the employee has to (or may) provide: what it is, what is accepted, a button to add it, and each file
// added so far with a remove button. `max` files can be added; with `max` 1 and `replaceable` the button turns into
// "Change" once there is a file.
export function UploadSlot({ title, hint, required, accept, max = 1, files, busy, pickLabel = 'Upload', replaceable, onPick, onRemove }: {
  title: string;
  hint: string;
  required?: boolean;
  accept: string;
  max?: number;
  files: UploadedFile[];
  busy?: boolean;
  pickLabel?: string;
  replaceable?: boolean;
  onPick: (file: File | undefined) => void;
  onRemove: (index: number) => void;
}) {
  const full = files.length >= max;
  const showPicker = !full || (replaceable && max === 1);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">{title}{required && <span className="text-rose-600"> *</span>}</p>
          <p className="text-caption text-slate-500 mt-0.5">{hint}</p>
        </div>
        {showPicker
          ? <FilePickButton accept={accept} onPick={onPick} loading={busy} variant={full ? 'secondary' : 'primary'}>{full ? 'Change' : files.length > 0 ? `${pickLabel} #${files.length + 1}` : pickLabel}</FilePickButton>
          : <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle weight="fill" className="h-4 w-4" aria-hidden="true" /> {max > 1 ? 'All added' : 'Added'}</span>}
      </div>
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-700">
              <span className="flex min-w-0 items-center gap-2">
                {f.preview
                  ? <img src={f.preview} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                  : <FileText weight="duotone" className="h-4 w-4 shrink-0 text-orange-600" aria-hidden="true" />}
                <span className="truncate">{f.name}</span>
              </span>
              <IconButton label={`Remove ${f.name}`} size="sm" onClick={() => onRemove(i)}><X className="h-4 w-4" aria-hidden="true" /></IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
