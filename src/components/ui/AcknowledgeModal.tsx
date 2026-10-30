'use client';

import React from 'react';
import type { Icon } from '@phosphor-icons/react';
import { CheckCircleIcon as CheckCircle2 } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

const TONE_TEXT = { amber: 'text-amber-600', sky: 'text-sky-600', rose: 'text-rose-600', orange: 'text-orange-600' } as const;

interface AcknowledgeModalProps {
  tone: keyof typeof TONE_TEXT;
  icon: Icon;
  eyebrow: string;
  title: string;
  // Small text beside the button (how many are waiting, or that it will keep appearing).
  note?: string;
  actionLabel: string;
  busyLabel?: string;
  busy?: boolean;
  onAction: () => void;
  children: React.ReactNode;
}

// A popup that cannot be swept away: the only way out is its own button, which records the acknowledgement. Used by the
// important-announcement, maintenance-notice and marked-absent popups. Mount it only while it should be showing.
export function AcknowledgeModal({ tone, icon: Icon, eyebrow, title, note, actionLabel, busyLabel = 'Saving…', busy = false, onAction, children }: AcknowledgeModalProps) {
  return (
    <Modal
      isOpen
      dismissible={false}
      onClose={() => {}}
      title={title}
      eyebrow={eyebrow}
      icon={<Icon weight="duotone" className={`h-5 w-5 ${TONE_TEXT[tone]}`} aria-hidden="true" />}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-caption font-semibold text-slate-500">{note}</p>
          <Button variant="primary" onClick={onAction} disabled={busy} className="shrink-0">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {busy ? busyLabel : actionLabel}
          </Button>
        </div>
      }
    >
      {children}
    </Modal>
  );
}
