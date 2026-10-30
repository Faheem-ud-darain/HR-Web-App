'use client';

import React, { useMemo } from 'react';
import { Profile, useProfiles } from '@/lib/hrData';
import { useSessionEmail } from '@/lib/useSession';
import { AppVersionCard } from '@/components/ui/AppVersionCard';
import { Badge } from '@/components/ui/Badge';
import { NotificationPreferencesCard } from '@/components/ui/NotificationPreferencesCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { AppearanceCard } from '@/components/ui/ThemeToggle';
import { ShieldCheckIcon as ShieldCheck } from '@/components/ui/icons';
import { InfoRow } from '@/components/ui/profile/ProfileCard';
import { ProfileHero } from '@/components/ui/profile/ProfileHero';
import { AccountDetailsCard, SecurityCard } from '@/components/ui/profile/ProfileSections';
import { useProfilePhoto } from '@/components/ui/profile/useProfilePhoto';

type StaffProfileViewProps = {
  /** Prefix for console error messages, e.g. "HR Profile". */
  logTag: string;
  title: string;
  subtitle: string;
  /** Shown when the profile has no job title set. */
  defaultJobTitle: string;
  /** Label for the "Security Role" row. */
  securityRoleLabel: string;
  /** Extra controls rendered next to the title (e.g. the admin's "Edit System Profiles"). */
  headerAction?: React.ReactNode;
};

// The signed-in HR / Admin user's own profile page, built from the same pieces as the employee's: the hero (photo
// change), account details, password, notification preferences. The two role pages only differ in copy and an
// optional header action.
export function StaffProfileView({ logTag, title, subtitle, defaultJobTitle, securityRoleLabel, headerAction }: StaffProfileViewProps) {
  const { data: employees = [], refetch: refetchProfiles } = useProfiles();
  const sessionEmail = useSessionEmail();
  const profile: Profile | null = useMemo(
    () => employees.find((e: Profile) => e.email && sessionEmail && e.email.toLowerCase() === sessionEmail.toLowerCase()) || null,
    [employees, sessionEmail],
  );
  const photo = useProfilePhoto({ profileId: profile?.id, logTag, onSaved: refetchProfiles });

  if (!profile) {
    return <div className="flex items-center justify-center py-24 text-slate-500 text-sm font-semibold">Loading profile…</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} action={headerAction} />
      <ProfileHero profile={profile} photo={photo} badges={<Badge variant="warning" className="capitalize">{profile.jobTitle || securityRoleLabel}</Badge>} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <AccountDetailsCard profile={profile} defaultTitle={defaultJobTitle}>
          <InfoRow icon={ShieldCheck} label="Security Role" value={securityRoleLabel} />
        </AccountDetailsCard>
        <div className="space-y-6">
          <SecurityCard logTag={logTag} onChanged={refetchProfiles} />
          <NotificationPreferencesCard email={profile.email} />
          <AppearanceCard />
          <AppVersionCard />
        </div>
      </div>
    </div>
  );
}
