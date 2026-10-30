'use client';

import React, { useMemo, useState } from 'react';
import { useProfiles, useProfileSelf, Profile, formatMoney } from '@/lib/hrData';
import { isMobileWallet } from '@/lib/core/onboarding';
import { useSessionEmail } from '@/lib/useSession';
import { AppVersionCard } from '@/components/ui/AppVersionCard';
import { Badge } from '@/components/ui/Badge';
import { GoogleIntegrationCard } from '@/components/ui/GoogleIntegrationCard';
import { LoggedInDevicesCard } from '@/components/ui/LoggedInDevicesCard';
import { NotificationPreferencesCard } from '@/components/ui/NotificationPreferencesCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { AppearanceCard } from '@/components/ui/ThemeToggle';
import { BankIcon as Landmark, PhoneIcon as Phone, StarIcon as Star, UsersIcon as Users } from '@/components/ui/icons';
import { BankDetailsModal, ContactNumbersModal } from '@/components/ui/profile/SelfServiceModals';
import { DollarSign, InfoList, InfoRow, ProfileEmpty, ProfileCard, RupeeSign } from '@/components/ui/profile/ProfileCard';
import { ProfileHero } from '@/components/ui/profile/ProfileHero';
import { AccountDetailsCard, DangerZoneCard, DocumentsCard, SecurityCard } from '@/components/ui/profile/ProfileSections';
import { useDocumentUploads } from '@/components/ui/profile/useDocumentUploads';
import { useProfilePhoto } from '@/components/ui/profile/useProfilePhoto';

type Tab = 'overview' | 'pay' | 'account';
type Dialog = 'bank' | 'phone' | null;
const TABS = [
  { value: 'overview' as const, label: 'Overview' },
  { value: 'pay' as const, label: 'Bank & Documents' },
  { value: 'account' as const, label: 'Account & Settings' },
];

// Three short pages instead of one long stack: who you are, where you are paid and what you have filed, and the
// account's own settings. Each page is two columns from lg up; phones (and the native apps) get one.
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
  const uploads = useDocumentUploads({ enabled: !!profile?.id && !!myDocs, // until the person's own documents have loaded, a new identity upload would replace the list with just itself
    identityDocs: myDocs?.identityDocs || [], onSaved: refetchDocs });
  const [tab, setTab] = useState<Tab>('overview');
  const [dialog, setDialog] = useState<Dialog>(null);
  const closeDialog = () => setDialog(null);

  if (!profile) {
    return <div className="flex items-center justify-center py-24 text-slate-500 text-sm font-semibold">Loading profile…</div>;
  }

  const usa = profile.region === 'USA';
  const teamLead = profile.isTeamLead && (profile.leadTeams?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <PageHeader title="My Profile" subtitle="Personal information and account settings." />

      <ProfileHero
        profile={profile}
        photo={photo}
        badges={<>
          <Badge variant="warning" className="capitalize">{profile.jobTitle || profile.role}</Badge>
          {teamLead && <Badge variant="warning" className="gap-1"><Star className="h-3.5 w-3.5" /> Team Lead · {profile.leadTeams?.join(', ')}</Badge>}
        </>}
      />

      <Tabs value={tab} onChange={setTab} items={TABS} aria-label="Profile sections" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {tab === 'overview' && (
          <>
            <AccountDetailsCard profile={profile} defaultTitle="Employee">
              <InfoRow icon={Users} label="Department Teams" value={profile.teams.join(', ') || '—'} />
              {/* Profile.baseSalary already reflects every processed anniversary increment, so it IS the current effective salary. */}
              <InfoRow label="Current Salary" value={`${formatMoney(profile.baseSalary, profile.region)} / month`} valueClass="text-emerald-700" iconClass="bg-emerald-50 text-emerald-600" icon={usa ? DollarSign : RupeeSign} />
            </AccountDetailsCard>

            <ProfileCard title="Contact Numbers" onEdit={() => setDialog('phone')}>
              {myDocs?.personalPhone || myDocs?.companyPhone ? (
                <InfoList>
                  <InfoRow icon={Phone} label="Own Number" value={myDocs?.personalPhone || '—'} />
                  <InfoRow icon={Phone} label="Company Allocated Number" value={myDocs?.companyPhone || 'Not applicable'} />
                </InfoList>
              ) : (
                <ProfileEmpty>No contact numbers on file yet. Add your own number (and a company-allocated one, if you have one).</ProfileEmpty>
              )}
            </ProfileCard>
          </>
        )}

        {tab === 'pay' && (
          <>
            <ProfileCard title="Bank Details" onEdit={() => setDialog('bank')}>
              {myDocs?.bankName ? (
                <InfoList>
                  <InfoRow icon={Landmark} label="Bank Name" value={myDocs.bankName} />
                  <InfoRow icon={Landmark} label="Account Number" value={myDocs.accountNumber || '—'} mono />
                  {(myDocs.iban || usa || !isMobileWallet(myDocs.bankName)) && <InfoRow icon={Landmark} label={usa ? 'Routing Number' : 'IBAN'} value={myDocs.iban || '—'} mono />}
                </InfoList>
              ) : (
                <ProfileEmpty>No bank details on file yet. Add them so payroll can process your salary correctly.</ProfileEmpty>
              )}
            </ProfileCard>
            <DocumentsCard docs={myDocs} uploads={uploads} usa={usa} />
          </>
        )}

        {tab === 'account' && (
          <>
            <div className="space-y-6">
              <SecurityCard logTag="Profile" />
              <NotificationPreferencesCard email={profile.email} />
              <AppearanceCard />
              <AppVersionCard />
            </div>
            <div className="space-y-6">
              <GoogleIntegrationCard profile={profile} />
              <LoggedInDevicesCard email={profile.email} />
              <DangerZoneCard profile={profile} />
            </div>
          </>
        )}
      </div>

      {dialog === 'bank' && <BankDetailsModal initial={myDocs ?? {}} region={profile.region} onSaved={refetchDocs} onClose={closeDialog} />}
      {dialog === 'phone' && <ContactNumbersModal initial={myDocs ?? {}} onSaved={refetchDocs} onClose={closeDialog} />}
    </div>
  );
}
