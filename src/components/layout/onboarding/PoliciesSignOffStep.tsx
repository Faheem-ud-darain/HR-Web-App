'use client';

import React from 'react';
import { ShieldCheckIcon as ShieldCheck, CheckCircleIcon as CheckCircle2 } from '@/components/ui/icons';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Profile } from '@/lib/hrData';

interface PoliciesSignOffStepProps {
  setActivePolicy: React.Dispatch<React.SetStateAction<"conduct" | "handbook" | "privacy" | null>>;
  acceptedDocs: { conduct: boolean; handbook: boolean; privacy: boolean; };
  setAcceptedDocs: React.Dispatch<React.SetStateAction<{ conduct: boolean; handbook: boolean; privacy: boolean; }>>;
  profile: Profile;
  signName: string;
  setSignName: React.Dispatch<React.SetStateAction<string>>;
  setOnboardStep: React.Dispatch<React.SetStateAction<number>>;
  handleCompleteOnboarding: () => Promise<void>;
  isCompletingOnboarding: boolean;
}

export function PoliciesSignOffStep({ setActivePolicy, acceptedDocs, setAcceptedDocs, profile, signName, setSignName, setOnboardStep, handleCompleteOnboarding, isCompletingOnboarding }: PoliciesSignOffStepProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-orange-600" /> Step 4: Policies & Sign Off
      </h2>
      <p className="text-sm text-slate-600 font-medium">Please read and acknowledge the shared corporate guidelines:</p>
    
      <div className="space-y-4 max-h-[200px] overflow-y-auto pr-2">
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
              <span className="text-sm font-semibold text-slate-900">Code of Conduct</span>
              <button 
                type="button" 
                onClick={() => setActivePolicy('conduct')} 
                className="text-caption font-bold text-orange-600 hover:underline text-left"
              >
                (Read Agreement)
              </button>
            </div>
            <input 
              type="checkbox" 
              checked={acceptedDocs.conduct}
              onChange={(e) => setAcceptedDocs(prev => ({ ...prev, conduct: e.target.checked }))}
              className="h-4 w-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500"
            />
          </div>
          <p className="text-xs text-slate-500">Professional interaction guidelines and conflict resolution frameworks.</p>
        </div>
    
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
              <span className="text-sm font-semibold text-slate-900">Employee Handbook</span>
              <button 
                type="button" 
                onClick={() => setActivePolicy('handbook')} 
                className="text-caption font-bold text-orange-600 hover:underline text-left"
              >
                (Read Agreement)
              </button>
            </div>
            <input 
              type="checkbox" 
              checked={acceptedDocs.handbook}
              onChange={(e) => setAcceptedDocs(prev => ({ ...prev, handbook: e.target.checked }))}
              className="h-4 w-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500"
            />
          </div>
          <p className="text-xs text-slate-500">Detailed guidelines on leave policies, salary increment cycles, and tools usage.</p>
        </div>
    
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
              <span className="text-sm font-semibold text-slate-900">Privacy & Data Policy</span>
              <button 
                type="button" 
                onClick={() => setActivePolicy('privacy')} 
                className="text-caption font-bold text-orange-600 hover:underline text-left"
              >
                (Read Agreement)
              </button>
            </div>
            <input 
              type="checkbox" 
              checked={acceptedDocs.privacy}
              onChange={(e) => setAcceptedDocs(prev => ({ ...prev, privacy: e.target.checked }))}
              className="h-4 w-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500"
            />
          </div>
          <p className="text-xs text-slate-500">Privacy guarantees and guidelines for processing corporate and customer data.</p>
        </div>
      </div>
    
      <div className="space-y-3">
        <FieldLabel size="md">
          Digital Signature <span className="text-slate-400 font-semibold text-caption lowercase">(Case-insensitive: must match your full name &quot;{profile.fullName}&quot; exactly)</span>
        </FieldLabel>
        <Input 
          type="text" 
          value={signName}
          onChange={(e) => setSignName(e.target.value)}
          fieldSize="md"
          placeholder={profile.fullName}
        />
      </div>
    
      <div className="flex gap-3 pt-4 border-t border-slate-200">
        <Button
          variant="outline"
          size="md"
          onClick={() => setOnboardStep(3)}
          className="flex-1 md:flex-none"
        >
          Back
        </Button>
        <button
          onClick={handleCompleteOnboarding}
          disabled={isCompletingOnboarding}
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-70 text-white font-semibold px-4 py-3 md:py-2 rounded-xl md:rounded-lg text-sm active:scale-97 transition-colors transition-transform flex items-center justify-center gap-1.5 shadow-sm"
        >
          {isCompletingOnboarding ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Finishing Up…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" /> Complete Onboarding
            </>
          )}
        </button>
      </div>
    </div>
  );
}
