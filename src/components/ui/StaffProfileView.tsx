'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Profile, useProfiles } from '@/lib/hrData';
import { formatDateNY } from '@/lib/timezone';
import { AvatarCropperModal } from '@/components/ui/lazy';
import { NotificationPreferencesCard } from '@/components/ui/NotificationPreferencesCard';
import { AppVersionCard } from '@/components/ui/AppVersionCard';
import { AppearanceCard } from '@/components/ui/ThemeToggle';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { InfoRow, ProfileCard } from '@/components/ui/profile/ProfileCard';
import { ChangePasswordModal } from '@/components/ui/profile/ChangePasswordModal';
import { useProfilePhoto } from '@/components/ui/profile/useProfilePhoto';
import { UserIcon as User, EnvelopeIcon as Mail, BriefcaseIcon as Briefcase, CalendarBlankIcon as Calendar, ShieldCheckIcon as ShieldCheck, KeyIcon as KeyRound, CameraIcon as Camera } from '@phosphor-icons/react/dist/ssr';
import { useSessionEmail } from '@/lib/useSession';

type StaffProfileViewProps = {
  /** Prefix for console error messages, e.g. "HR Profile". */
  logTag: string;
  title: string;
  subtitle: string;
  /** Shown when the profile has no job title set. */
  defaultJobTitle: string;
  defaultGender: 'Male' | 'Female';
  /** Label for the "Security Role" row. */
  securityRoleLabel: string;
  /** Extra controls rendered next to the title (e.g. the admin's "Edit System Profiles"). */
  headerAction?: React.ReactNode;
};

// The signed-in HR / Admin user's own profile page: avatar + photo change, account details, password change,
// notification preferences. The two role pages only differ in copy and an optional header action.
export function StaffProfileView({ logTag, title, subtitle, defaultJobTitle, defaultGender, securityRoleLabel, headerAction }: StaffProfileViewProps) {
  const { data: employees = [], refetch: refetchProfiles } = useProfiles();
  const sessionEmail = useSessionEmail();
  const profile: Profile | null = useMemo(
    () => employees.find((e: Profile) => e.email && sessionEmail && e.email.toLowerCase() === sessionEmail.toLowerCase()) || null,
    [employees, sessionEmail],
  );

  const photo = useProfilePhoto({ profileId: profile?.id, logTag, onSaved: refetchProfiles });
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);

  if (!profile) {
    return <div className="flex items-center justify-center py-24 text-slate-400 text-sm font-semibold">Loading profile…</div>;
  }

  const infoRows = [
    { icon: Mail, label: 'Email Address', value: profile.email },
    { icon: Briefcase, label: 'Designation / Title', value: profile.jobTitle || defaultJobTitle },
    { icon: User, label: 'Gender / Pronouns', value: profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : defaultGender },
    { icon: Calendar, label: 'Joined Date', value: formatDateNY(profile.joinedDate) },
    { icon: ShieldCheck, label: 'Security Role', value: securityRoleLabel },
  ];

  return (
    // Two columns from lg up; phone-sized viewports (including the native apps) never reach lg, so they stay single-column.
    <div className="space-y-6 md:space-y-8 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-slate-900">{title}</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        {headerAction}
      </div>

      <Card className="p-0 overflow-hidden border border-slate-200">
        <div className="h-20 md:h-24 bg-orange-600" />
        <div className="px-4 md:px-6 pb-5 md:pb-6">
          <div className="-mt-10 mb-4 flex items-end justify-between">
            <div className="relative group">
              {profile.profilePicture ? (
                <img src={profile.profilePicture} alt="Profile" className="h-16 w-16 md:h-20 md:w-20 rounded-full bg-white border-4 border-white shadow-md object-cover" />
              ) : (
                <div className="h-16 w-16 md:h-20 md:w-20 rounded-full border-4 border-white shadow-md flex items-center justify-center text-xl md:text-2xl font-bold text-orange-600 bg-orange-50">
                  {profile.fullName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                </div>
              )}
              <button
                onClick={() => photoInputRef.current?.click()}
                title="Change profile picture"
                aria-label="Change profile picture"
                className="absolute bottom-0 right-0 h-5 w-5 md:h-7 md:w-7 rounded-full bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center shadow-md border-2 border-white transition-colors transition-transform active:scale-90"
              >
                <Camera className="h-3.5 w-3.5 md:h-3.5 md:w-3.5" />
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" onChange={photo.handleInputChange} className="hidden" />
            </div>
            <Button variant="secondary" size="sm" onClick={() => setPasswordOpen(true)} className="border border-slate-200">
              <KeyRound className="h-3.5 w-3.5" /> Reset Password
            </Button>
          </div>

          <h2 className="text-lg md:text-xl font-bold text-slate-900">{profile.fullName}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="warning" className="capitalize">{profile.jobTitle || securityRoleLabel}</Badge>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 items-start">
        <ProfileCard title="Account Details">
          <div className="divide-y divide-slate-100">
            {infoRows.map(row => <InfoRow key={row.label} {...row} />)}
          </div>
        </ProfileCard>

        <div className="space-y-6 md:space-y-8">
          <ProfileCard title="Security">
            <div className="px-4 md:px-6 py-4 md:py-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center"><KeyRound className="h-4 w-4 text-slate-500" /></div>
                <div>
                  <p className="text-xs md:text-sm font-semibold text-slate-900">Password</p>
                  <p className="text-xs text-slate-500 mt-0.5">Change your account password at any time.</p>
                </div>
              </div>
              <Button variant="primary" onClick={() => setPasswordOpen(true)} className="flex-shrink-0">Change Password</Button>
            </div>
          </ProfileCard>

          <NotificationPreferencesCard email={profile.email} />
          <AppearanceCard />
          <AppVersionCard />
        </div>
      </div>

      {passwordOpen && <ChangePasswordModal logTag={logTag} onChanged={refetchProfiles} onClose={() => setPasswordOpen(false)} />}
      <AvatarCropperModal file={photo.pendingFile} onClose={photo.clearPending} onSave={photo.handleSave} />
    </div>
  );
}
