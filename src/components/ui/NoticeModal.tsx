'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button, type ButtonVariant } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

type Tone = 'rose' | 'amber' | 'orange';

const TONE: Record<Tone, { box: string; icon: string }> = {
  rose: { box: 'bg-rose-50 border-rose-200', icon: 'text-rose-600' },
  amber: { box: 'bg-amber-50 border-amber-200', icon: 'text-amber-600' },
  orange: { box: 'bg-orange-50 border-orange-200', icon: 'text-orange-600' },
};

interface NoticeModalProps {
  title: string;
  tone: Tone;
  icon: LucideIcon;
  // The explanation, shown in a tinted box with the icon.
  children: React.ReactNode;
  // Further tinted notices under the first (e.g. a warning that applies only sometimes).
  extra?: { tone: Tone; icon: LucideIcon; text: React.ReactNode }[];
  // The main action. Left out for a plain "got it" notice.
  action?: { label: string; onClick: () => void; variant?: ButtonVariant; disabled?: boolean };
  closeLabel?: string;
  // Disables Close while the action is running.
  busy?: boolean;
  onClose: () => void;
}

// A message the person must read, with an optional main action and a Close button. Used for the shift and tracker
// prompts (desktop required, tracker missing / outdated / needs reconnecting, shift ended) and the force actions.
// Mount it only while it should be showing.
export function NoticeModal({ title, tone, icon: Icon, children, extra = [], action, closeLabel = 'Close', busy = false, onClose }: NoticeModalProps) {
  return (
    <Modal isOpen onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className={`flex items-start gap-3 border p-4 rounded-xl ${TONE[tone].box}`}>
          <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${TONE[tone].icon}`} />
          <p className="text-xs text-slate-700 font-semibold leading-relaxed">{children}</p>
        </div>
        {extra.map((n, i) => (
          <div key={i} className={`flex items-start gap-3 border p-4 rounded-xl ${TONE[n.tone].box}`}>
            <n.icon className={`h-5 w-5 shrink-0 mt-0.5 ${TONE[n.tone].icon}`} />
            <p className="text-xs text-slate-700 font-semibold leading-relaxed">{n.text}</p>
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          {action && <Button variant={action.variant ?? 'primary'} size="md" onClick={action.onClick} disabled={action.disabled}>{action.label}</Button>}
          <Button variant="secondary" size="md" onClick={onClose} disabled={busy}>{closeLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}
