'use client';

import React from 'react';
import { UploadSimpleIcon as Upload } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';
import { UploadSlot } from '@/components/ui/UploadSlot';
import type { Profile } from '@/lib/hrData';
import { StepActions, StepHeader } from './StepParts';
import type { useOnboardingForm } from './useOnboardingForm';

type Form = ReturnType<typeof useOnboardingForm>;

// Step 2: the photo and CV, then the identity scans, then (USA only) an optional passport: one page of the step at a time.
export function DocumentsStep({ profile, form, onSkip }: { profile: Profile; form: Form; onSkip: () => void }) {
  const { documents: d, page, pages, scansNeeded } = form;
  const usa = profile.region === 'USA';
  const last = page === pages;
  return (
    <div className="space-y-6">
      <StepHeader icon={Upload} title={`Upload documents (${page}/${pages})`} text={['Add your profile picture and CV.', 'Add your identification.', 'Add a secondary ID if you have one (optional).'][page - 1]} />

      {page === 1 && (
        <div className="space-y-4">
          <UploadSlot
            title="Profile picture" required hint="A front-facing photo. You can crop it after choosing." accept="image/*" replaceable pickLabel="Upload photo"
            files={d.picture ? [{ name: 'Your photo', preview: d.picture }] : []}
            onPick={f => f && form.setPendingPhoto(f)} onRemove={d.removePicture}
          />
          <UploadSlot
            title="Curriculum Vitae (CV)" required hint="PDF only." accept="application/pdf,.pdf" pickLabel="Upload PDF"
            files={d.cv ? [{ name: d.cv.name }] : []} busy={d.busy === 'cv'} onPick={d.pickCv} onRemove={d.removeCv}
          />
        </div>
      )}

      {page === 2 && (
        <UploadSlot
          title={usa ? 'Driver License / Work Permit' : 'CNIC card (both sides)'} required max={scansNeeded} accept="image/*" pickLabel="Upload scan"
          hint={usa ? 'Upload 1 front scan.' : 'Upload 2 scans: the front and the back.'}
          files={d.identity.map(f => ({ name: f.name }))} busy={d.busy === 'identity'} onPick={d.pickIdentity} onRemove={d.removeIdentity}
        />
      )}

      {page === 3 && (
        <UploadSlot
          title="Passport (secondary ID)" hint="An image scan. Optional." accept="image/*" pickLabel="Upload scan"
          files={d.passport ? [{ name: d.passport.name }] : []} busy={d.busy === 'passport'} onPick={d.pickPassport} onRemove={d.removePassport}
        />
      )}

      <StepActions onBack={form.back} onNext={form.next} nextLabel={last ? 'Finish documents' : 'Confirm & continue'}>
        {page === 3 && <Button type="button" variant="secondary" size="lg" onClick={onSkip} className="md:flex-none">Skip</Button>}
      </StepActions>
    </div>
  );
}
