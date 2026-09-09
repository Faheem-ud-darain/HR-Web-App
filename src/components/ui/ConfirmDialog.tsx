'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

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

  React.useEffect(() => {
    if (isOpen) setTypedText('');
  }, [isOpen]);

  if (!isOpen) return null;

  const isConfirmDisabled = loading || (!!requireTextMatch && typedText.trim() !== requireTextMatch);

  const colors = variant === 'danger'
    ? { icon: 'text-rose-600', iconBg: 'bg-rose-50 border-rose-100', button: 'bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300' }
    : { icon: 'text-amber-600', iconBg: 'bg-amber-50 border-amber-100', button: 'bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300' };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-white rounded-xl p-6 shadow-2xl max-w-sm w-full space-y-4"
        role="alertdialog"
        aria-modal="true"
      >
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center border ${colors.iconBg}`}>
          <AlertTriangle className={`h-5 w-5 ${colors.icon}`} />
        </div>
        <div className="space-y-1.5">
          <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">{message}</p>
        </div>

        {requireTextMatch && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Type <span className="font-mono text-rose-600">{requireTextMatch}</span> to confirm
            </label>
            <input
              type="text"
              value={typedText}
              onChange={e => setTypedText(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:border-rose-500 rounded-xl py-2 px-3 text-xs outline-none font-semibold focus:ring-2 focus:ring-rose-100"
              placeholder={requireTextMatch}
              autoFocus
            />
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={loading}
            className="flex-1 transition-shadow active:scale-97 transition-transform"
          >
            {cancelLabel}
          </Button>
          <button
            type="button"
            disabled={isConfirmDisabled}
            onClick={onConfirm}
            className={`flex-1 text-white font-bold py-2.5 rounded-xl text-xs transition-colors transition-transform transition-shadow active:scale-97 disabled:cursor-not-allowed ${colors.button}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
