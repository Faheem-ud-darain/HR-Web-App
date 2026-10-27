'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useProfiles, useProfileSelf, Profile, formatMoney } from '@/lib/hrData';
import { Card } from '@/components/ui/Card';
import { AvatarCropperModal } from '@/components/ui/lazy';
import { NotificationPreferencesCard } from '@/components/ui/NotificationPreferencesCard';
import { AppVersionCard } from '@/components/ui/AppVersionCard';
import { AppearanceCard } from '@/components/ui/ThemeToggle';
import { LoggedInDevicesCard } from '@/components/ui/LoggedInDevicesCard';
import { GoogleIntegrationCard } from '@/components/ui/GoogleIntegrationCard';
import { Badge } from '@/components/ui/Badge';
import { InfoRow, ProfileCard } from '@/components/ui/profile/ProfileCard';
import { ChangePasswordModal } from '@/components/ui/profile/ChangePasswordModal';
import { BankDetailsModal, ContactNumbersModal, DeleteAccountRequestModal, useAccountDeletionRequest } from '@/components/ui/profile/SelfServiceModals';
import { useProfilePhoto } from '@/components/ui/profile/useProfilePhoto';
import { useDocumentUploads } from '@/components/ui/profile/useDocumentUploads';
import { Mail, Briefcase, User, Calendar, Users, ShieldCheck, KeyRound, Star, Landmark, Pencil, Camera, FileText, Upload, Phone } from 'lucide-react';
import { formatDateNY } from '@/lib/timezone';
import { Button } from '@/components/ui/Button';
import { useSessionEmail } from '@/lib/useSession';

// Currency symbols drawn like an icon, for the salary row.
const DollarSign = ({ className }: { className?: string }) => <span className={`font-bold text-sm leading-none ${className}`}>$</span>;
const RupeeSign = ({ className }: { className?: string }) => <span className={`font-bold text-sm leading-none ${className}`}>₨</span>;

type Dialog = 'password' | 'bank' | 'phone' | 'delete' | null;

// One document slot (CV, passport): what is on file and an Upload / Replace button.
function DocumentRow({ label, fileName, busy, onPick }: { label: string; fileName?: string; busy: boolean; onPick: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center justify-between gap-3 px-6 py-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0"><FileText className="h-4 w-4 text-slate-500" /></div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
          <p className="text-sm font-semibold text-slate-900 mt-0.5 truncate">{fileName || 'Not uploaded yet'}</p>
        </div>
      </div>
      <Button variant="secondary" size="md" onClick={() => inputRef.current?.click()} disabled={busy} className="flex-shrink-0 border border-slate-200">
        <Upload className="h-3.5 w-3.5" /> {busy ? 'Uploading…' : fileName ? 'Replace' : 'Upload'}
      </Button>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" onChange={onPick} className="hidden" />
    </div>
  );
}

const EditButton = ({ onClick }: { onClick: () => void }) => (
  <Button variant="secondary" size="md" onClick={onClick} className="border border-slate-200"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
);

const EmptyNote = ({ children }: { children: React.ReactNode }) => (
  <div className="px-6 py-6 text-center"><p className="text-xs text-slate-400 italic font-semibold">{children}</p></div>
);

export default function EmployeeProfilePage() {
  const { data: allProfiles, refetch: refetchProfiles } = useProfiles();
  const sessionEmail = useSessionEmail();
  const profile: Profile | null = useMemo(
    () => allProfiles?.find(e => e.email && sessionEmail && e.email.toLowerCase() === sessionEmail.toLowerCase()) || null,
    [allProfiles, sessionEmail],
  );
  // Bank details, phones, documents and the password all come from the server-side self-service route (see
  // useProfileSelf); the public roster above only supplies display fields (name, role, joined date...).
  const { data: myDocs, refetch: refetchDocs } = useProfileSelf();

  const photo = useProfilePhoto({ profileId: profile?.id, logTag: 'Profile', onSaved: refetchProfiles }); // the profile is derived from the roster, so it updates itself
  const docs = useDocumentUploads({ enabled: !!profile?.id && !!myDocs, // until the person's own documents have loaded, a new identity upload would replace the list with just itself
    identityDocs: myDocs?.identityDocs || [], onSaved: refetchDocs });
  const deletion = useAccountDeletionRequest(profile?.email);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const idInputRef = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const closeDialog = () => setDialog(null);

  if (!profile) {
    return <div className="flex items-center justify-center py-24 text-slate-400 text-sm font-semibold">Loading profile…</div>;
  }

  const usa = profile.region === 'USA';
  const identityDocs = myDocs?.identityDocs || [];
  // Profile.baseSalary already reflects every processed anniversary increment, so it IS the current effective salary.
  const infoRows = [
    { icon: Mail, label: 'Email Address', value: profile.email },
    { icon: Briefcase, label: 'Designation / Title', value: profile.jobTitle || 'Employee' },
    { icon: User, label: 'Gender / Pronouns', value: profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : 'Male' },
    { icon: Calendar, label: 'Joined Date', value: formatDateNY(profile.joinedDate) },
    { icon: Users, label: 'Department Teams', value: profile.teams.join(', ') || '—' },
    { icon: ShieldCheck, label: 'Onboarding Status', value: profile.onboardingCompleted ? 'Completed ✓' : 'Incomplete' },
  ];

  return (
    // Wide enough for the two-column layout at lg. Phones never reach lg, so the native apps stay single-column
    // without a separate Capacitor check (responsive-only, like the rest of the app).
    <div className="space-y-6 md:space-y-8 max-w-6xl">
      <div>
        <h1 className="text-lg md:text-2xl font-bold text-slate-900">My Profile</h1>
        <p className="text-xs md:text-sm text-slate-500 mt-0.5">Personal information and account settings.</p>
      </div>

      <Card className="p-0 overflow-hidden border border-slate-200">
        <div className="h-24 bg-orange-600" />
        <div className="px-6 pb-6">
          <div className="-mt-10 mb-4 flex items-end justify-between">
            <div className="relative group">
              {profile.profilePicture ? (
                <img src={profile.profilePicture} alt="Profile" className="h-20 w-20 rounded-full bg-white border-4 border-white shadow-md object-cover" />
              ) : (
                <div className="h-20 w-20 rounded-full border-4 border-white shadow-md flex items-center justify-center text-2xl font-bold text-orange-600 bg-orange-50">
                  {profile.fullName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                </div>
              )}
              <button
                onClick={() => photoInputRef.current?.click()}
                title="Change profile picture"
                aria-label="Change profile picture"
                className="absolute -bottom-0.5 -right-0.5 h-5 w-5 md:h-6 md:w-6 rounded-full bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center shadow-sm border-[1.5px] border-white transition-colors transition-transform active:scale-90"
              >
                <Camera className="h-2.5 w-2.5 md:h-3 md:w-3" />
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" onChange={photo.handleInputChange} className="hidden" />
            </div>
            <Button variant="secondary" size="md" onClick={() => setDialog('password')} className="border border-slate-200">
              <KeyRound className="h-3.5 w-3.5" /> Reset Password
            </Button>
          </div>

          <h2 className="text-xl font-bold text-slate-900">{profile.fullName}</h2>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <Badge variant="warning" className="capitalize">{profile.jobTitle || profile.role}</Badge>
            {profile.isTeamLead && (profile.leadTeams?.length ?? 0) > 0 && (
              <Badge variant="warning" className="gap-1"><Star className="h-3 w-3" /> Team Lead · {profile.leadTeams?.join(', ')}</Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Two columns on desktop instead of one narrow centre column; items-start keeps each column's height its own. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 items-start">
        <div className="space-y-6 md:space-y-8">
          <ProfileCard title="Account Details">
            <div className="divide-y divide-slate-100">
              {infoRows.map(row => <InfoRow key={row.label} {...row} />)}
              <InfoRow
                label="Current Salary"
                value={`${formatMoney(profile.baseSalary, profile.region)} / month`}
                valueClass="text-emerald-700"
                iconClass="bg-emerald-50 text-emerald-600"
                icon={usa ? DollarSign : RupeeSign}
              />
            </div>
          </ProfileCard>

          <ProfileCard title="Bank Details" action={<EditButton onClick={() => setDialog('bank')} />}>
            {myDocs?.bankName ? (
              <div className="divide-y divide-slate-100">
                <InfoRow icon={Landmark} label="Bank Name" value={myDocs.bankName} />
                <InfoRow icon={Landmark} label="Account Number" value={myDocs.accountNumber || '—'} mono />
                <InfoRow icon={Landmark} label={usa ? 'Routing Number' : 'IBAN'} value={myDocs.iban || '—'} mono />
              </div>
            ) : (
              <EmptyNote>No bank details on file yet. Add them so payroll can process your salary correctly.</EmptyNote>
            )}
          </ProfileCard>

          <ProfileCard title="Contact Numbers" action={<EditButton onClick={() => setDialog('phone')} />}>
            {myDocs?.personalPhone || myDocs?.companyPhone ? (
              <div className="divide-y divide-slate-100">
                <InfoRow icon={Phone} label="Own Number" value={myDocs?.personalPhone || '—'} />
                <InfoRow icon={Phone} label="Company Allocated Number" value={myDocs?.companyPhone || 'Not applicable'} />
              </div>
            ) : (
              <EmptyNote>No contact numbers on file yet. Add your own number (and a company-allocated one, if you have one).</EmptyNote>
            )}
          </ProfileCard>

          <ProfileCard title="Security">
            <div className="px-4 md:px-6 py-4 md:py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center"><KeyRound className="h-4 w-4 text-slate-500" /></div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Password</p>
                  <p className="text-xs text-slate-500 mt-0.5">Change your account password at any time.</p>
                </div>
              </div>
              <Button variant="primary" size="md" onClick={() => setDialog('password')} className="w-full sm:w-auto flex-shrink-0">Change Password</Button>
            </div>
          </ProfileCard>
        </div>

        <div className="space-y-6 md:space-y-8">
          <GoogleIntegrationCard profile={profile} />

          <ProfileCard title="My Documents" subtitle="Images up to 3 MB (auto-converted to WebP), PDFs up to 5 MB. Visible to HR/Admin under Master Reports.">
            <div className="divide-y divide-slate-100">
              <DocumentRow label="CV / Resume" fileName={myDocs?.cvFileName} busy={docs.busy === 'cv'} onPick={docs.onCv} />

              <div className="px-6 py-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{usa ? 'Driver License / Work Permit' : 'CNIC (Front/Back)'}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{identityDocs.length} document(s) on file</p>
                  </div>
                  <Button variant="secondary" size="md" onClick={() => idInputRef.current?.click()} disabled={docs.busy === 'id'} className="flex-shrink-0 border border-slate-200">
                    <Upload className="h-3.5 w-3.5" /> {docs.busy === 'id' ? 'Uploading…' : 'Add Document'}
                  </Button>
                  <input ref={idInputRef} type="file" accept="image/*,application/pdf" onChange={docs.onId} className="hidden" />
                </div>
                {identityDocs.length > 0 && (
                  <ul className="text-xs text-slate-600 space-y-1 pl-1">{identityDocs.map((d, i) => <li key={i} className="truncate">• {d.name}</li>)}</ul>
                )}
              </div>

              <DocumentRow label="Passport (Optional)" fileName={myDocs?.passportFileName} busy={docs.busy === 'passport'} onPick={docs.onPassport} />
            </div>
          </ProfileCard>

          <NotificationPreferencesCard email={profile.email} />
          <LoggedInDevicesCard email={profile.email} />
          <AppearanceCard />
          <AppVersionCard />

          <Card className="border border-rose-200 p-5 space-y-3">
            <h3 className="font-bold text-rose-700 text-sm">Danger Zone</h3>
            {deletion.request ? (
              <div className="text-xs text-slate-600 font-medium leading-relaxed bg-rose-50 border border-rose-100 rounded-lg p-3">
                Account deletion requested on {formatDateNY(deletion.request.requestedAt)}. HR will contact you to confirm and process this — it hasn&apos;t been deleted yet.
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-500 leading-relaxed">
                  You can request that your account and personal data be deleted. HR will be notified immediately and will follow up to confirm before anything is removed.
                </p>
                <Button variant="outline" size="md" onClick={() => setDialog('delete')} className="!text-rose-600 !bg-rose-50 hover:!bg-rose-100 !border-rose-200">Request Account Deletion</Button>
              </>
            )}
          </Card>
        </div>
      </div>

      {dialog === 'password' && <ChangePasswordModal logTag="Profile" onClose={closeDialog} />}
      {dialog === 'bank' && <BankDetailsModal initial={myDocs ?? {}} region={profile.region} onSaved={refetchDocs} onClose={closeDialog} />}
      {dialog === 'phone' && <ContactNumbersModal initial={myDocs ?? {}} onSaved={refetchDocs} onClose={closeDialog} />}
      {dialog === 'delete' && <DeleteAccountRequestModal profile={profile} onRequested={requestedAt => deletion.setRequest({ requestedAt })} onClose={closeDialog} />}

      <AvatarCropperModal file={photo.pendingFile} onClose={photo.clearPending} onSave={photo.handleSave} />
    </div>
  );
}
