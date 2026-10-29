'use client';

import React, { useState } from 'react';
import { BriefcaseIcon as Briefcase, CalendarBlankIcon as Calendar, EnvelopeIcon as Mail, KeyIcon as KeyRound, UserIcon as User } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { UploadSlot } from '@/components/ui/UploadSlot';
import type { Profile } from '@/lib/hrData';
import { DOCS_BUDGET_MB } from '@/lib/core/onboarding';
import { formatDateNY } from '@/lib/timezone';
import { ChangePasswordModal } from '@/components/ui/profile/ChangePasswordModal';
import { DeleteAccountRequestModal, useAccountDeletionRequest } from '@/components/ui/profile/SelfServiceModals';
import type { useDocumentUploads } from '@/components/ui/profile/useDocumentUploads';
import { InfoList, InfoRow, ProfileCard } from '@/components/ui/profile/ProfileCard';

// The sections both profile pages are made of. Each one owns its own dialog, so a page only decides which to show.

// Email, title, gender and joined date for everyone; `children` adds the rows that differ by role (team, salary, role).
export function AccountDetailsCard({ profile, defaultTitle, children }: { profile: Profile; defaultTitle: string; children?: React.ReactNode }) {
  return (
    <ProfileCard title="Account Details">
      <InfoList>
        <InfoRow icon={Mail} label="Email Address" value={profile.email} />
        <InfoRow icon={Briefcase} label="Designation / Title" value={profile.jobTitle || defaultTitle} />
        <InfoRow icon={User} label="Gender / Pronouns" value={profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : '—'} />
        <InfoRow icon={Calendar} label="Joined Date" value={formatDateNY(profile.joinedDate)} />
        {children}
      </InfoList>
    </ProfileCard>
  );
}

export function SecurityCard({ logTag, onChanged }: { logTag: string; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <ProfileCard title="Security">
      <div className="px-4 md:px-6 py-4 md:py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 shrink-0 rounded-lg bg-slate-100 flex items-center justify-center"><KeyRound weight="duotone" className="h-4 w-4 text-slate-500" aria-hidden="true" /></div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Password</p>
            <p className="text-xs text-slate-500 mt-0.5">Change your account password at any time.</p>
          </div>
        </div>
        <Button variant="primary" size="md" onClick={() => setOpen(true)} className="w-full sm:w-auto shrink-0">Change Password</Button>
      </div>
      {open && <ChangePasswordModal logTag={logTag} onChanged={onChanged} onClose={() => setOpen(false)} />}
    </ProfileCard>
  );
}

type Docs = null | undefined | { cvFileName?: string; passportFileName?: string; identityDocs?: { name: string }[]; docsBytes?: number };

// CV, identity documents and passport: what is on file, with a button to add or replace each.
export function DocumentsCard({ docs, uploads, usa }: { docs: Docs; uploads: ReturnType<typeof useDocumentUploads>; usa: boolean }) {
  const identity = docs?.identityDocs || [];
  const used = ((docs?.docsBytes ?? 0) / 1.37 / 1048576).toFixed(1);
  return (
    <ProfileCard title="My Documents" subtitle={`All documents together can take about ${DOCS_BUDGET_MB} MB (${used} MB used). Images are converted to WebP. Visible to HR/Admin under Master Reports.`}>
      <div className="p-4 md:p-6 space-y-3">
        <UploadSlot
          title="CV / Resume" hint="PDF or image." accept="image/*,application/pdf" replaceable pickLabel="Upload"
          files={docs?.cvFileName ? [{ name: docs.cvFileName }] : []} busy={uploads.busy === 'cv'} onPick={uploads.onCv}
        />
        <UploadSlot
          title={usa ? 'Driver License / Work Permit' : 'CNIC (Front/Back)'} hint="Add every page you have, front and back." accept="image/*,application/pdf" max={4} pickLabel="Add document"
          files={identity.map(d => ({ name: d.name }))} busy={uploads.busy === 'id'} onPick={uploads.onId}
        />
        <UploadSlot
          title="Passport (Optional)" hint="A secondary ID." accept="image/*,application/pdf" replaceable pickLabel="Upload"
          files={docs?.passportFileName ? [{ name: docs.passportFileName }] : []} busy={uploads.busy === 'passport'} onPick={uploads.onPassport}
        />
      </div>
    </ProfileCard>
  );
}

// Asking HR to delete the account (App Store requirement: a way to start it from inside the app).
export function DangerZoneCard({ profile }: { profile: Profile }) {
  const deletion = useAccountDeletionRequest(profile.email);
  const [open, setOpen] = useState(false);
  return (
    <Card className="border border-rose-200 p-4 md:p-6 space-y-3">
      <h3 className="font-bold text-rose-700 text-sm">Danger Zone</h3>
      {deletion.request ? (
        <p className="text-xs text-slate-600 font-medium leading-relaxed bg-rose-50 border border-rose-100 rounded-lg p-3">
          Account deletion requested on {formatDateNY(deletion.request.requestedAt)}. HR will contact you to confirm and process this — it hasn&apos;t been deleted yet.
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500 leading-relaxed">
            You can request that your account and personal data be deleted. HR will be notified immediately and will follow up to confirm before anything is removed.
          </p>
          <Button variant="danger" size="md" onClick={() => setOpen(true)} className="w-full sm:w-auto">Request Account Deletion</Button>
        </>
      )}
      {open && <DeleteAccountRequestModal profile={profile} onRequested={requestedAt => deletion.setRequest({ requestedAt })} onClose={() => setOpen(false)} />}
    </Card>
  );
}
