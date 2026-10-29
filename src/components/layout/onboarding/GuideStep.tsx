import React from 'react';
import { QuestionIcon as HelpCircle } from '@/components/ui/icons';
import { FEATURE_GUIDE } from '@/lib/core/onboarding';
import { StepActions, StepHeader } from './StepParts';

// Step 3: a short tour of the sections the employee will use.
export function GuideStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className="space-y-6">
      <StepHeader icon={HelpCircle} title="Platform guide" text="Here is what you will find in your DelCargo portal." />
      <ol className="space-y-3">
        {FEATURE_GUIDE.map((f, i) => (
          <li key={f.title} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <h3 className="text-sm font-bold text-slate-900">{i + 1}. {f.title}</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{f.text}</p>
          </li>
        ))}
      </ol>
      <StepActions onBack={onBack} onNext={onNext} />
    </div>
  );
}
