'use client';

import React from 'react';
import { WarningIcon as AlertTriangle } from '@/components/ui/icons';
import { Button } from './Button';
import { Modal } from './Modal';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  requireTextMatch?: string; // if set, user must type this exact text to enable confirm
  loading?: boolean; // when true, disables both buttons so a rapid double-click/tap can't fire onConfirm twice
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  requireTextMatch,
  loading = false,
}: ConfirmDialogProps) {
  const [typedText, setTypedText] = React.useState('');

  // Start each time the dialog opens with an empty confirmation box. (Adjusting state
  // while rendering is React's recommended way to reset state when a prop changes.)
  const [wasOpen, setWasOpen] = React.useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setTypedText('');
  }

  const isConfirmDisabled = loading || (!!requireTextMatch && typedText.trim() !== requireTextMatch);
  const tone = variant === 'danger' ? 'text-rose-600' : 'text-amber-600';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={<AlertTriangle weight="duotone" className={`h-5 w-5 ${tone}`} aria-hidden="true" />}
      className="md:max-w-sm"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading} className="flex-1">{cancelLabel}</Button>
          <Button type="button" variant={variant} onClick={onConfirm} disabled={isConfirmDisabled} className="flex-1">{confirmLabel}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500 font-semibold leading-relaxed">{message}</p>
        {requireTextMatch && (
          <FormField label={<>Type <span className="font-mono text-rose-600">{requireTextMatch}</span> to confirm</>}>
            <Input type="text" value={typedText} onChange={e => setTypedText(e.target.value)} fieldSize="sm" placeholder={requireTextMatch} autoFocus />
          </FormField>
        )}
      </div>
    </Modal>
  );
}
