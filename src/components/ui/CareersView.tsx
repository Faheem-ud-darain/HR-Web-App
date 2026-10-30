'use client';

import { Tabs } from '@/components/ui/Tabs';
import { IconButton } from '@/components/ui/IconButton';
import React, { useState } from 'react';
import { StatusDot } from '@/components/ui/StatusDot';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CareerPosition, CareerApplication, useCareers, useWarehouses, useTeams, hrActions, getCareerApplicationsAdmin } from '@/lib/hrData';
import { MapPinIcon as MapPin, PlusIcon as Plus, TrashIcon as Trash2, ArrowRightIcon as ArrowRight, UsersIcon as Users } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';
import { useQuery } from '@tanstack/react-query';
import { CAREERS_HERO, DEPARTMENTS } from '@/components/ui/careers/careerOptions';
import { ApplicationsModal } from '@/components/ui/careers/ApplicationsModal';
import { AddJobModal } from '@/components/ui/careers/AddJobModal';
import { ApplyModal } from '@/components/ui/careers/ApplyModal';
import { CompanyIntro, LifeAtDelcargo, ReferralProgramNote } from '@/components/ui/careers/CareersSections';
import { PublicJobList } from '@/components/ui/careers/PublicJobList';

interface CareersViewProps {
  role: 'admin' | 'hr' | 'employee' | 'team_lead' | 'public';
  /** Show the "Work with DelCargo" opening. False where the page has already shown it. */
  hero?: boolean;
}

export function CareersView({ role, hero = true }: CareersViewProps) {
  const { data: allCareers, refetch: refetchCareers } = useCareers();
  const { data: allWarehouses } = useWarehouses();
  const { data: allTeams } = useTeams();

  const positions = allCareers || [];
  const warehouseCount = allWarehouses ? allWarehouses.length : 0;
  const teamCount = allTeams ? allTeams.length : 0;

  // Applications hold applicant PII (name, email, cover letter) — plan 012
  // moved this off the public `useCareerApplications()` hook onto an
  // HR/Admin-session-checked API route (src/app/api/admin/careers/
  // applications), fetched the same "one-time fetch, not a React Query
  // hook" way admin/insights fetches absence records. Only fetched at all
  // when the signed-in user is actually HR/Admin — an Employee or Team
  // Lead never even issues the request.
  const isStaff = role === 'hr' || role === 'admin';
  const { data: allApplications, refetch: refetchApplicationsQuery } = useQuery({
    queryKey: ['career_applications_admin'],
    enabled: isStaff,
    queryFn: getCareerApplicationsAdmin,
  });
  // Best-effort, like before: a failed refresh just leaves the modal showing the last data.
  const refetchApplications = React.useCallback(async () => { if (isStaff) await refetchApplicationsQuery(); }, [isStaff, refetchApplicationsQuery]);
  const applications: CareerApplication[] = isStaff ? (allApplications || []) : [];

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [applySession, setApplySession] = useState(0); // a new number per opening, so the form starts empty each time
  const [selectedJob, setSelectedJob] = useState<CareerPosition | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const [isApplicationsOpen, setIsApplicationsOpen] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [pendingDeleteJobId, setPendingDeleteJobId] = useState<string | null>(null);

  // Careers page is for external candidates only — anyone already inside the
  // org (employee, team_lead, hr, admin) should not be able to submit an
  // application through this same form.
  const canApply = role === 'public';

  const handleDeleteJob = (id: string) => {
    if (deletingJobId) return;
    setPendingDeleteJobId(id);
  };

  const confirmDeleteJob = async () => {
    if (!pendingDeleteJobId) return;
    const id = pendingDeleteJobId;
    setPendingDeleteJobId(null);
    setDeletingJobId(id);
    try {
      await hrActions.deleteCareer(id);
      refetchCareers();
    } finally {
      setDeletingJobId(null);
    }
  };

  const canEdit = role === 'hr' || role === 'admin';
  const categories = ['All', ...DEPARTMENTS];

  const filteredJobs = selectedCategory === 'All' 
    ? positions 
    : positions.filter(j => j.department.toLowerCase() === selectedCategory.toLowerCase());

  const openApply = (job: CareerPosition) => { setSelectedJob(job); setApplySession(n => n + 1); setIsApplyOpen(true); };

  // Outside candidates get the dark landing-page layout: who we are, the perks, then the open positions.
  if (role === 'public') {
    return (
      <div className="space-y-20 sm:space-y-32 font-sans w-full min-w-0">
        <CompanyIntro warehouseCount={warehouseCount} teamCount={teamCount} openPositions={positions.length} />
        <LifeAtDelcargo />
        <PublicJobList positions={positions} onApply={openApply} />
        <ApplyModal key={applySession} isOpen={isApplyOpen} onClose={() => setIsApplyOpen(false)} job={selectedJob} canApply={canApply} onSubmitted={refetchApplications} />
      </div>
    );
  }

  return (
    // min-w-0 is required here: this component is rendered as a flex item
    // inside both the dashboard's flex-col main content wrapper and (via
    // Card contexts elsewhere) similar flex layouts.
    <div className="space-y-8 sm:space-y-16 mx-auto font-sans w-full min-w-0 px-1 sm:px-0 overflow-x-hidden">
      
      {/* The opening words. The landing page shows them in its own hero instead (hero={false}). */}
      {hero && (
        <section className="text-center space-y-3 py-3 sm:py-8 px-2 sm:px-4 w-full min-w-0 overflow-hidden">
          <h1 className="font-display text-2xl sm:text-5xl font-bold text-slate-900 tracking-tight uppercase break-words max-w-full leading-snug" style={{ textWrap: 'wrap' }}>
            {CAREERS_HERO.title}
          </h1>
          <div className="h-0.5 w-10 sm:w-12 bg-orange-600 mx-auto" />
          <p className="max-w-2xl mx-auto text-slate-500 text-xs sm:text-base font-light leading-relaxed break-words px-1">
            {CAREERS_HERO.text}
          </p>
        </section>
      )}

      {/* Categories Filter tab */}
      <Tabs variant="underline" aria-label="Job category" className="justify-start sm:justify-center" value={selectedCategory} onChange={setSelectedCategory} items={categories.map(cat => ({ value: cat, label: cat }))} />

      {/* Grid listing */}
      <div className="space-y-6 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="font-display text-lg sm:text-2xl font-bold text-slate-900 uppercase tracking-wide">
            Open Positions ({filteredJobs.length})
          </h2>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="md"
                onClick={() => setIsApplicationsOpen(true)}
                className="min-h-[38px]"
              >
                <Users className="h-4 w-4 text-orange-600" /> Applications ({applications.length})
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => setIsAddOpen(true)}
                className="min-h-[38px]"
              >
                <Plus className="h-4 w-4" /> Post Job
              </Button>
            </div>
          )}
        </div>

        {/* Job postings: Responsive list on mobile / 2-col grid on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {filteredJobs.map(job => (
            <div
              key={job.id}
              className="w-full bg-white border border-slate-200 hover:border-orange-200 rounded-xl p-5 sm:p-8 flex flex-col justify-between transition-colors shadow-sm"
            >
              <div className="space-y-4 sm:space-y-6">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base sm:text-lg tracking-tight leading-snug">{job.title}</h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-semibold mt-1.5">
                      <span className="text-orange-700 font-bold uppercase tracking-wider text-caption bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{job.department}</span>
                      <span className="flex items-center gap-1 text-slate-500"><MapPin className="h-3.5 w-3.5 text-slate-400" /> {job.location}</span>
                    </div>
                  </div>
                  {canEdit && (
                    <IconButton size="sm" label="Delete job" loading={deletingJobId === job.id} onClick={() => handleDeleteJob(job.id)} className="text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></IconButton>
                  )}
                </div>

                <p className="text-xs sm:text-xs text-slate-600 leading-relaxed font-normal">{job.description}</p>

                {job.requirements.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <p className="text-caption font-bold text-slate-400 uppercase tracking-widest">Requirements</p>
                    <ul className="space-y-1.5">
                      {job.requirements.map((req, idx: number) => (
                        <li key={idx} className="text-xs text-slate-600 font-medium flex items-start gap-2">
                          <StatusDot tone="orange" className="mt-1.5" />
                          <span>{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 mt-5 flex items-center justify-between">
                {canApply ? (
                  <Button variant="softOrange" size="sm" className="w-full sm:w-auto" onClick={() => openApply(job)}>
                    Apply now <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <span className="text-caption font-semibold text-slate-400 italic">
                    External applicants only — see HR for internal transfers
                  </span>
                )}
              </div>
            </div>
          ))}

          {filteredJobs.length === 0 && (
            <div className="md:col-span-2 text-center py-16 px-4 text-slate-400 font-light italic text-sm border border-dashed border-slate-200 bg-white rounded-xl">
              No vacancies listed in this category.
            </div>
          )}
        </div>
      </div>

      {role === 'employee' && <ReferralProgramNote />}

      <ApplicationsModal isOpen={isApplicationsOpen} onClose={() => setIsApplicationsOpen(false)} applications={applications} onChanged={refetchApplications} />
      <AddJobModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onPosted={refetchCareers} />
      {/* Stays mounted so the dialog can return focus and play its exit animation; `key` gives it a fresh form per opening. */}
      <ApplyModal key={applySession} isOpen={isApplyOpen} onClose={() => setIsApplyOpen(false)} job={selectedJob} canApply={canApply} onSubmitted={refetchApplications} />

      <ConfirmDialog
        isOpen={pendingDeleteJobId !== null}
        onClose={() => setPendingDeleteJobId(null)}
        onConfirm={confirmDeleteJob}
        title="Delete listing?"
        message="Are you sure you want to delete this listing?"
        confirmLabel={deletingJobId ? 'Deleting…' : 'Delete'}
        variant="danger"
        loading={!!deletingJobId}
      />
    </div>
  );
}
