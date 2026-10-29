import React from 'react';
import type { Icon } from '@phosphor-icons/react';
import { CaretRightIcon as ChevronRight } from '@/components/ui/icons';
import { Button, type ButtonVariant } from '@/components/ui/Button';

// The title of a wizard step: a duotone icon, the name, and one line saying what to do.
export function StepHeader({ icon: Glyph, title, text }: { icon: Icon; title: string; text?: string }) {
  return (
    <div className="space-y-1.5">
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Glyph weight="duotone" className="h-6 w-6 text-orange-600" aria-hidden="true" /> {title}</h2>
      {text && <p className="text-sm text-slate-600 font-medium">{text}</p>}
    </div>
  );
}

// The buttons under a step: Back on the left (when there is somewhere to go back to) and the main action filling the rest.
export function StepActions({ onBack, onNext, nextLabel = 'Continue', nextVariant = 'primary', loading, children }: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: React.ReactNode;
  nextVariant?: ButtonVariant;
  loading?: boolean;
  /** Extra buttons between Back and the main action (e.g. "Skip"). */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 pt-5 border-t border-slate-200">
      {onBack && <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={loading} className="md:flex-none">Back</Button>}
      {children}
      <Button type="button" variant={nextVariant} size="lg" onClick={onNext} loading={loading} className="flex-1">{nextLabel}{!loading && nextVariant === 'primary' && <ChevronRight className="h-4 w-4" aria-hidden="true" />}</Button>
    </div>
  );
}
