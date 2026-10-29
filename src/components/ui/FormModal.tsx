'use client';

import React, { useId } from 'react';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/FormError';
import { Modal } from '@/components/ui/Modal';

interface FormModalProps {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  busy?: boolean;
  submitLabel: string;
  // The message from the last failed save or check; shown above the fields.
  error?: string;
  // A small line under the fields (what saving does, who sees it).
  note?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

// A popup with a form: the fields scroll, Cancel and the submit button stay pinned underneath. Mount it only while it
// should be showing, so the fields start from the current values.
export function FormModal({ title, onClose, onSubmit, busy = false, submitLabel, error, note, className, children }: FormModalProps) {
  const formId = useId();
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      className={className}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button type="button" variant="outline" size="md" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} size="md" loading={busy}>{submitLabel}</Button>
        </div>
      }
    >
      <form id={formId} onSubmit={e => { e.preventDefault(); if (!busy) onSubmit(); }} className="space-y-4">
        <FormError>{error}</FormError>
        {children}
        {note && <p className="text-caption text-slate-500 leading-relaxed">{note}</p>}
      </form>
    </Modal>
  );
}
