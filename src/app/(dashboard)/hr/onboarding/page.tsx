'use client';

import React, { useState } from 'react';
import { Profile, useProfiles, useTeams } from '@/lib/hrData';
import { matchesOnboardingTab, type OnboardingTab } from '@/lib/core/onboarding';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { OnboardEmployeeModal } from './_components/OnboardEmployeeModal';
import { OnboardingList } from './_components/OnboardingList';
import { PendingApprovalsBanner } from './_components/PendingApprovalsBanner';
import { ReviewDocumentsModal } from './_components/ReviewDocumentsModal';

export default function HROnboardingPage() {
  const { data: employees = [], isLoading: profilesLoading, refetch: refetchProfiles } = useProfiles();
  const { data: teams = [], refetch: refetchTeams } = useTeams();
  const [activeTab, setActiveTab] = useState<OnboardingTab>('all');
  const [isOnboardOpen, setIsOnboardOpen] = useState(false);
  const [reviewing, setReviewing] = useState<Profile | null>(null);

  const inTab = (tab: OnboardingTab) => employees.filter(e => matchesOnboardingTab(e, tab));
  const pending = inTab('pending');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Onboarding Pipelines</h1>
          <p className="text-slate-500">Track registration completeness and review document submissions.</p>
        </div>
        <Button variant="primary" size="md" onClick={() => setIsOnboardOpen(true)}>
          <UserPlus className="h-4 w-4" /> Onboard Employee
        </Button>
      </div>

      <Tabs
        variant="chips"
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { value: 'all', label: 'All', count: employees.length },
          { value: 'pending', label: 'Pending Approval', count: pending.length, tone: 'warning' },
          { value: 'rejected', label: 'Rejected', count: inTab('rejected').length, tone: 'danger' },
          { value: 'approved', label: 'Approved / Active', count: inTab('approved').length, tone: 'success' },
        ]}
      />

      {pending.length > 0 && activeTab === 'all' && <PendingApprovalsBanner pending={pending} onReview={setReviewing} />}

      <OnboardingList employees={inTab(activeTab)} loading={profilesLoading} onReview={setReviewing} />

      {isOnboardOpen && (
        <OnboardEmployeeModal
          teams={teams}
          onRegistered={() => { refetchTeams(); refetchProfiles(); }}
          onClose={() => setIsOnboardOpen(false)}
        />
      )}
      {reviewing && <ReviewDocumentsModal employee={reviewing} onDone={refetchProfiles} onClose={() => setReviewing(null)} />}
    </div>
  );
}
