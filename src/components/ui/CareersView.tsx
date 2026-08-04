'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import {
  CareerPosition,
  CareerApplication,
  CareerApplicationStatus,
  useCareers,
  useCareerApplications,
  useWarehouses,
  useTeams,
  hrActions,
} from '@/lib/hrData';
import { MapPin, Plus, Trash2, CheckCircle2, ArrowRight, X, Briefcase, FileText, Users, AlertTriangle, Gift, Loader2 } from 'lucide-react';

const STATUS_OPTIONS: { value: CareerApplicationStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'hired', label: 'Hired' },
];

const STATUS_STYLES: Record<CareerApplicationStatus, string> = {
  pending: 'bg-slate-100 text-slate-600 border-slate-200',
  reviewed: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  shortlisted: 'bg-amber-50 text-amber-700 border-amber-100',
  rejected: 'bg-rose-50 text-rose-700 border-rose-100',
  hired: 'bg-emerald-50 text-emerald-700 border-emerald-100',
};

interface CareersViewProps {
  role: 'admin' | 'hr' | 'employee' | 'team_lead' | 'public';
}

export function CareersView({ role }: CareersViewProps) {
  const { data: allCareers, refetch: refetchCareers } = useCareers();
  const { data: allApplications, refetch: refetchApplications } = useCareerApplications();
  const { data: allWarehouses } = useWarehouses();
  const { data: allTeams } = useTeams();

  const positions = allCareers || [];
  const warehouseCount = allWarehouses ? allWarehouses.length : 0;
  const teamCount = allTeams ? allTeams.length : 0;
  const applications = (role === 'hr' || role === 'admin') ? (allApplications || []) : [];

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<CareerPosition | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const [isApplicationsOpen, setIsApplicationsOpen] = useState(false);
  const [appPositionFilter, setAppPositionFilter] = useState<string>('All');
  const [appStatusFilter, setAppStatusFilter] = useState<CareerApplicationStatus | 'All'>('All');
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [isPostingJob, setIsPostingJob] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [dept, setDept] = useState('Engineering');
  const [loc, setLoc] = useState('');
  const [desc, setDesc] = useState('');
  const [reqsText, setReqsText] = useState('');
  const [success, setSuccess] = useState('');

  const [applicantName, setApplicantName] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [applySuccess, setApplySuccess] = useState('');
  const [applyError, setApplyError] = useState('');
  const [isSubmittingApp, setIsSubmittingApp] = useState(false);

  // Careers page is for external candidates only — anyone already inside the
  // org (employee, team_lead, hr, admin) should not be able to submit an
  // application through this same form.
  const canApply = role === 'public';

  const handleAddJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !loc || !desc || isPostingJob) return;
    setIsPostingJob(true);
    try {
      const requirements = reqsText.split('\n').map(r => r.trim()).filter(Boolean);
      await hrActions.addCareer({
        title,
        department: dept,
        location: loc,
        description: desc,
        requirements,
      });
      refetchCareers();
      setSuccess('Position listed successfully!');
      setTimeout(() => {
        setIsAddOpen(false);
        setTitle('');
        setLoc('');
        setDesc('');
        setReqsText('');
        setSuccess('');
      }, 1200);
    } finally {
      setIsPostingJob(false);
    }
  };

  const handleDeleteJob = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this listing?') || deletingJobId) return;
    setDeletingJobId(id);
    try {
      await hrActions.deleteCareer(id);
      refetchCareers();
    } finally {
      setDeletingJobId(null);
    }
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApplyError('');
    if (!canApply) return; // internal users are blocked server-flow too, this is just defense in depth
    if (!applicantName || !applicantEmail || !selectedJob) return;

    setIsSubmittingApp(true);
    try {
      // Anti-spam guard: block a second submission from the same email to
      // the same posting instead of silently creating duplicate rows.
      const alreadyApplied = await hrActions.hasAppliedForPosition(selectedJob.id, applicantEmail);
      if (alreadyApplied) {
        setApplyError('You have already submitted an application for this position with this email address. Our HR team already has it on file.');
        return;
      }

      await hrActions.submitCareerApplication({
        positionId: selectedJob.id,
        positionTitle: selectedJob.title,
        applicantName,
        applicantEmail,
        coverLetter,
      });
      // The Applications review panel is available to HR and Admin alike
      // (see canEdit above) — notify both, not just HR.
      await hrActions.addNotification('all', 'hr', `New application for "${selectedJob?.title}" submitted by ${applicantName} (${applicantEmail})`);
      await hrActions.addNotification('all', 'admin', `New application for "${selectedJob?.title}" submitted by ${applicantName} (${applicantEmail})`);
      refetchApplications();
      setApplySuccess('Application submitted successfully! Our HR team will get back to you.');
      setTimeout(() => {
        setIsApplyOpen(false);
        setApplicantName('');
        setApplicantEmail('');
        setCoverLetter('');
        setApplySuccess('');
        setSelectedJob(null);
      }, 2000);
    } finally {
      setIsSubmittingApp(false);
    }
  };

  const handleStatusChange = async (appId: string, status: CareerApplicationStatus) => {
    setStatusUpdating(appId);
    try {
      await hrActions.updateApplicationStatus(appId, status);
      refetchApplications();
    } finally {
      setStatusUpdating(null);
    }
  };

  const canEdit = role === 'hr' || role === 'admin';
  const categories = ['All', 'Engineering', 'Design', 'Marketing', 'Operations', 'HR'];

  const filteredJobs = selectedCategory === 'All' 
    ? positions 
    : positions.filter(j => j.department.toLowerCase() === selectedCategory.toLowerCase());

  return (
    // min-w-0 is required here: this component is rendered as a flex item
    // inside both the dashboard's flex-col main content wrapper and (via
    // Card contexts elsewhere) similar flex layouts.
    <div className="space-y-8 sm:space-y-16 max-w-6xl mx-auto font-sans w-full min-w-0 px-1 sm:px-0 overflow-x-hidden">
      
      {/* High-End Editorial Hero Section */}
      <section className="text-center space-y-3 py-3 sm:py-8 px-2 sm:px-4 w-full min-w-0 overflow-hidden">
        <h1
          className="text-2xl sm:text-5xl font-light text-slate-900 tracking-tight uppercase break-words max-w-full leading-snug"
          style={{ fontFamily: 'Georgia, serif', textWrap: 'wrap' }}
        >
          Work with DelCargo
        </h1>
        <div className="h-0.5 w-10 sm:w-12 bg-orange-600 mx-auto" />
        <p className="max-w-2xl mx-auto text-slate-500 text-xs sm:text-base font-light leading-relaxed break-words px-1">
          We are building the future of supply-chain technology. Join our collaborative logistics and product teams in creating beautiful, operational-grade software.
        </p>
      </section>

      {/* Categories Filter tab */}
      <div className="border-b border-slate-200 flex overflow-x-auto gap-2.5 sm:gap-6 justify-start sm:justify-center text-xs uppercase tracking-wider font-bold text-slate-400 no-scrollbar pb-1.5 px-1 max-w-full">
        {categories.map(cat => {
          const active = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`pb-2.5 px-2 whitespace-nowrap transition-colors shrink-0 text-xs ${
                active 
                  ? 'border-b-2 border-orange-600 text-slate-900 font-extrabold' 
                  : 'hover:text-slate-700 font-semibold'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Grid listing */}
      <div className="space-y-6 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg font-light text-slate-900 uppercase tracking-widest" style={{ fontFamily: 'Georgia, serif' }}>
            Open Positions ({filteredJobs.length})
          </h2>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsApplicationsOpen(true)}
                className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-3 py-2 rounded-xl text-xs active:scale-97 transition-colors flex items-center gap-1.5 shadow-sm min-h-[38px]"
              >
                <Users className="h-4 w-4 text-orange-600" /> Applications ({applications.length})
              </button>
              <button
                onClick={() => setIsAddOpen(true)}
                className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-3.5 py-2 rounded-xl text-xs active:scale-97 transition-colors flex items-center gap-1.5 shadow-sm min-h-[38px]"
              >
                <Plus className="h-4 w-4" /> Post Job
              </button>
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
                      <span className="text-orange-700 font-bold uppercase tracking-wider text-[10px] bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{job.department}</span>
                      <span className="flex items-center gap-1 text-slate-500"><MapPin className="h-3.5 w-3.5 text-slate-400" /> {job.location}</span>
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => handleDeleteJob(job.id)}
                      disabled={deletingJobId === job.id}
                      className="text-slate-400 hover:text-rose-600 p-1.5 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center"
                    >
                      {deletingJobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  )}
                </div>

                <p className="text-xs sm:text-xs text-slate-600 leading-relaxed font-normal">{job.description}</p>

                {job.requirements.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Requirements</p>
                    <ul className="space-y-1.5">
                      {job.requirements.map((req: any, idx: number) => (
                        <li key={idx} className="text-xs text-slate-600 font-medium flex items-start gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0" />
                          <span>{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 mt-5 flex items-center justify-between">
                {canApply ? (
                  <button
                    onClick={() => { setSelectedJob(job); setApplyError(''); setIsApplyOpen(true); }}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 text-xs font-bold bg-orange-50 sm:bg-transparent text-orange-600 hover:text-orange-700 py-2.5 sm:py-0 px-4 sm:px-0 rounded-lg sm:rounded-none tracking-wider uppercase transition-colors"
                  >
                    Apply now <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <span className="text-[10px] font-semibold text-slate-400 italic">
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

      {role === 'public' && (
        <>
          {/* About Us Section */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-12 mb-8 shadow-sm overflow-hidden font-sans">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center">
              
              {/* Left Column: Descriptive texts & stats */}
              <div className="lg:col-span-7 space-y-5 sm:space-y-6">
                <div className="space-y-2">
                  <span className="inline-block text-[10px] font-bold text-orange-600 uppercase tracking-widest bg-orange-50 border border-orange-100 px-3 py-1 rounded-full">
                    Global Freight & Software
                  </span>
                  <h3 className="text-xl sm:text-2xl font-light text-slate-900 uppercase tracking-wider mt-2" style={{ fontFamily: 'Georgia, serif' }}>
                    Who We Are
                  </h3>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                  DelCargo is a leading-edge global logistics and software engineering provider. We combine digital shipping architectures with physical distribution hubs to enable intelligent supply chain management. By fusing freight yards with automated tracking platforms, we help scale global commerce.
                </p>

                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  We maintain strategic warehousing facilities in major transit centers across North America and remote design cells in South Asia, operating with around-the-clock synchrony to keep supply lines operating optimally.
                </p>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-4 border-t border-slate-100">
                  <div className="text-center sm:text-left">
                    <p className="text-base sm:text-lg font-bold text-slate-900">{warehouseCount}</p>
                    <p className="text-[8px] sm:text-[9px] text-slate-400 font-bold uppercase tracking-wider">Active Warehouses</p>
                  </div>
                  <div className="text-center sm:text-left">
                    <p className="text-base sm:text-lg font-bold text-slate-900">{teamCount}</p>
                    <p className="text-[8px] sm:text-[9px] text-slate-400 font-bold uppercase tracking-wider">Departments</p>
                  </div>
                  <div className="text-center sm:text-left">
                    <p className="text-base sm:text-lg font-bold text-slate-900">{positions.length}</p>
                    <p className="text-[8px] sm:text-[9px] text-slate-400 font-bold uppercase tracking-wider">Open Positions</p>
                  </div>
                </div>
              </div>

              {/* Right Column: Image */}
              <div className="lg:col-span-5 relative group overflow-hidden rounded-xl border border-slate-200 shadow">
                <img 
                  src="/delcargo_warehouse_hightech.png" 
                  alt="High Tech Warehouse" 
                  className="w-full h-48 sm:h-64 object-cover object-center group-hover:scale-103 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent flex flex-col justify-end p-4">
                  <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Operations Hub</p>
                  <p className="text-white text-xs font-bold mt-0.5">Automated Warehouse JFK Center</p>
                </div>
              </div>

            </div>
          </section>

          {/* Culture & Benefits Section */}
          <section className="bg-slate-50/50 py-8 sm:py-12 px-5 sm:px-12 border border-slate-200 rounded-xl space-y-6 sm:space-y-8">
            <div className="text-center space-y-1.5">
              <h3 className="text-lg sm:text-xl font-light text-slate-900 uppercase tracking-widest" style={{ fontFamily: 'Georgia, serif' }}>
                Life at DelCargo
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider">Perks & Compensation</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 text-left">
              <div className="space-y-1.5 bg-white sm:bg-transparent p-4 sm:p-0 rounded-xl border sm:border-0 border-slate-100">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800">Good Salary</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-light">We offer competitive salaries calibrated for regional standards, with guaranteed annual increments.</p>
              </div>
              <div className="space-y-1.5 bg-white sm:bg-transparent p-4 sm:p-0 rounded-xl border sm:border-0 border-slate-100">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800">Accrued PTOs</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-light">Accrue leave balance every month with cashing out settlements.</p>
              </div>
              <div className="space-y-1.5 bg-white sm:bg-transparent p-4 sm:p-0 rounded-xl border sm:border-0 border-slate-100">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800">Learning & Tech</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-light">Collaborate using modern architectures, framework toolsets, and clean design structures.</p>
              </div>
              <div className="space-y-1.5 bg-white sm:bg-transparent p-4 sm:p-0 rounded-xl border sm:border-0 border-slate-100">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800">Parental Leaves</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-light">Gender-balanced opportunities including fully paid Parental Leaves.</p>
              </div>
            </div>
          </section>
        </>
      )}

      {role === 'employee' && (
        /* Referral Program Info Block */
        <section className="bg-orange-50/40 py-12 px-6 sm:px-12 border border-orange-100 rounded-xl space-y-4">
          <h3 className="text-lg font-bold text-slate-950 flex items-center gap-1.5">
            <Gift className="h-5 w-5 text-orange-600" /> Employee Referral Program
          </h3>
          <p className="text-xs text-slate-600 max-w-3xl leading-relaxed font-medium">
            Know someone who would be a perfect fit? Refer them! If your referred candidate gets selected and successfully completes <strong>6 months</strong> of service with DelCargo, you will receive a cash referral reward of <strong>PKR 10,000</strong>. Submissions can be sent directly to HR.
          </p>
        </section>
      )}

      {/* Applications review Modal (HR/Admin only) */}
      <Modal isOpen={isApplicationsOpen} onClose={() => setIsApplicationsOpen(false)} title={`Job Applications (${applications.length})`}>
        {(() => {
          const positionTitles = Array.from(new Set(applications.map(a => a.positionTitle))).sort();
          const filteredApps = applications.filter(app =>
            (appPositionFilter === 'All' || app.positionTitle === appPositionFilter) &&
            (appStatusFilter === 'All' || app.status === appStatusFilter)
          );

          return (
            <div className="space-y-3">
              {/* Filters */}
              <div className="flex flex-wrap gap-2 pb-3 border-b border-slate-200">
                <select
                  value={appPositionFilter}
                  onChange={e => setAppPositionFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-orange-500"
                >
                  <option value="All">All Positions</option>
                  {positionTitles.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                  value={appStatusFilter}
                  onChange={e => setAppStatusFilter(e.target.value as CareerApplicationStatus | 'All')}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-orange-500"
                >
                  <option value="All">All Statuses</option>
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <span className="ml-auto self-center text-[10px] font-semibold text-slate-400">
                  {filteredApps.length} of {applications.length} shown
                </span>
              </div>

              <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                {filteredApps.length === 0 && (
                  <p className="text-center text-slate-400 font-semibold italic text-xs py-8">
                    {applications.length === 0 ? 'No applications submitted yet.' : 'No applications match the selected filters.'}
                  </p>
                )}
                {filteredApps.map(app => {
                  const expanded = expandedAppId === app.id;
                  return (
                    <div key={app.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <button
                        onClick={() => setExpandedAppId(expanded ? null : app.id)}
                        className="w-full flex items-center justify-between text-left"
                      >
                        <div>
                          <p className="text-sm font-bold text-slate-900">{app.applicantName}</p>
                          <p className="text-[10px] text-orange-600 font-bold uppercase tracking-wider">{app.positionTitle}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 ${STATUS_STYLES[app.status]}`}>
                            {STATUS_OPTIONS.find(s => s.value === app.status)?.label || app.status}
                          </span>
                          <span className="text-[9px] text-slate-400 font-semibold shrink-0">{app.submittedAt}</span>
                        </div>
                      </button>

                      {expanded && (
                        <div className="border-t border-slate-200 pt-3 mt-1 space-y-3">
                          <p className="text-xs text-slate-500 font-semibold">{app.applicantEmail}</p>
                          {app.coverLetter && (
                            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{app.coverLetter}</p>
                          )}
                          <div className="flex items-center gap-2 pt-1">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest shrink-0">Status</label>
                            <select
                              value={app.status}
                              disabled={statusUpdating === app.id}
                              onChange={e => handleStatusChange(app.id, e.target.value as CareerApplicationStatus)}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-orange-500 disabled:opacity-50"
                            >
                              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Add job listing Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Create New Job Listing">
        <form onSubmit={handleAddJob} className="space-y-4 pt-1">
          {success && (
            <div className="p-3 text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> {success}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Job Title *</label>
            <input 
              type="text" 
              required 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-orange-100 font-semibold"
              placeholder="e.g. Lead QA Engineer" 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Department</label>
              <select 
                value={dept} 
                onChange={e => setDept(e.target.value)} 
                className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-orange-100 font-semibold cursor-pointer appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.875rem center',
                  backgroundSize: '1rem'
                }}
              >
                <option value="Engineering">Engineering</option>
                <option value="Design">Design</option>
                <option value="Marketing">Marketing</option>
                <option value="Operations">Operations</option>
                <option value="HR">HR</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Location *</label>
              <input 
                type="text" 
                required 
                value={loc} 
                onChange={e => setLoc(e.target.value)} 
                className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-orange-100 font-semibold"
                placeholder="e.g. Remote (Pakistan)" 
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Description *</label>
            <textarea 
              required 
              rows={3} 
              value={desc} 
              onChange={e => setDesc(e.target.value)} 
              className="w-full bg-slate-50/50 hover:bg-slate-100 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-orange-100 font-semibold resize-none"
              placeholder="Provide details about the role..." 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Requirements (One per line)</label>
            <textarea 
              rows={3} 
              value={reqsText} 
              onChange={e => setReqsText(e.target.value)} 
              className="w-full bg-slate-50/50 hover:bg-slate-100 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-orange-100 font-semibold"
              placeholder="Requirement 1&#10;Requirement 2&#10;Requirement 3" 
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" disabled={isPostingJob} onClick={() => setIsAddOpen(false)} className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 font-bold px-4 py-2 rounded-xl text-xs active:scale-97 transition-colors transition-transform disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
            <button type="submit" disabled={isPostingJob} className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2 rounded-xl text-xs active:scale-97 transition-colors transition-transform shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
              {isPostingJob && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isPostingJob ? 'Posting…' : 'Post Opening'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Apply Modal */}
      <Modal isOpen={isApplyOpen} onClose={() => setIsApplyOpen(false)} title={`Apply: ${selectedJob?.title}`}>
        <form onSubmit={handleApplySubmit} className="space-y-4 pt-1">
          {applySuccess ? (
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-800 text-xs font-semibold leading-relaxed">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mb-1" />
              {applySuccess}
            </div>
          ) : (
            <>
              {applyError && (
                <div className="p-3 text-xs bg-rose-50 text-rose-700 border border-rose-100 rounded-xl font-semibold flex items-start gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" /> {applyError}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Full Name *</label>
                <input 
                  type="text" 
                  required 
                  value={applicantName} 
                  onChange={e => setApplicantName(e.target.value)} 
                  className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-orange-100 font-semibold"
                  placeholder="e.g. John Doe" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Email Address *</label>
                <input 
                  type="email" 
                  required 
                  value={applicantEmail} 
                  onChange={e => setApplicantEmail(e.target.value)} 
                  className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-orange-100 font-semibold"
                  placeholder="e.g. applicant@company.com" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cover Letter / Note</label>
                <textarea 
                  rows={3} 
                  value={coverLetter} 
                  onChange={e => setCoverLetter(e.target.value)} 
                  className="w-full bg-slate-50/50 hover:bg-slate-100 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-orange-100 font-semibold resize-none"
                  placeholder="Say hello or detail your fit..." 
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => setIsApplyOpen(false)} className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 font-bold px-4 py-2 rounded-xl text-xs active:scale-97 transition-colors transition-transform">Cancel</button>
                <button type="submit" disabled={isSubmittingApp} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-bold px-4 py-2 rounded-xl text-xs active:scale-97 transition-colors transition-transform shadow-sm">
                  {isSubmittingApp ? 'Submitting…' : 'Submit Application'}
                </button>
              </div>
            </>
          )}
        </form>
      </Modal>
    </div>
  );
}
